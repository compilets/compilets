import path from 'node:path';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import CppProject from './cpp-project';
import Typer from './parser-typer';
import * as syntax from './cpp-syntax';

import {
  UnimplementedError,
  UnsupportedError,
  operatorToString,
  modifierToString,
  getFileNameFromModuleSpecifier,
  getNamespaceFromFileName,
  isExportedDeclaration,
  isModuleImports,
  isFunctionLikeNode,
  isTemplateFunctor,
  filterNode,
  parseHint,
} from './parser-utils';

/**
 * Convert TypeScript AST to C++ source code.
 */
export default class Parser {
  project: CppProject;
  program: ts.Program;
  typer: Typer;

  constructor(project: CppProject) {
    if (project.getFiles().length > 0)
      throw new Error('The project has already been parsed');
    this.project = project;
    this.program = ts.createProgram(project.fileNames, project.compilerOptions);
    this.typer = new Typer(project, this.program.getTypeChecker());
  }

  parse() {
    // Run pre-emit diagnostics.
    if (!this.project.skipPreEmitDiagnostics)
      this.runPreEmitDiagnostics();
    // Start parsing.
    for (const fileName of this.program.getRootFileNames()) {
      const sourceFile = this.program.getSourceFile(fileName)!;
      const cppFile = this.parseSourceFile(fileName, sourceFile);
      this.project.addParsedFile(cppFile.name, cppFile);
    }
  }

  runPreEmitDiagnostics() {
    const diagnostics = ts.getPreEmitDiagnostics(this.program);
    if (diagnostics.length == 0)
      return;
    const diagnostic = diagnostics[0];
    let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (diagnostic.file) {
      const {line, character} = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
      let {fileName} = diagnostic.file;
      if (fileName.startsWith(this.project.rootDir))
        fileName = fileName.substr(this.project.rootDir.length + 1);
      message = `${fileName} (${line + 1},${character + 1}): ${message}`;
    }
    throw new Error(message);
  }

  parseSourceFile(fileName: string, sourceFile: ts.SourceFile): CppFile {
    const fileNameInProject = path.relative(this.project.sourceRootDir, fileName);
    const fileNameInFileSystem = path.relative(this.project.rootDir, fileName);
    const cppFile = new CppFile(fileNameInFileSystem,
                                this.project.getFileType(fileNameInFileSystem),
                                this.typer.interfaceRegistry);
    // For multi-file project add namespace for each file.
    if (this.project.fileNames.length > 1)
      cppFile.namespace = getNamespaceFromFileName(fileNameInProject);
    // Parse root nodes in the file.
    ts.forEachChild(sourceFile, (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.ImportDeclaration:
          cppFile.addImport(this.parseImportDeclaration(node as ts.ImportDeclaration));
          return;
        case ts.SyntaxKind.ClassDeclaration:
          if (!cppFile.canAddDeclaration())
            throw new UnsupportedError(node, 'Can not add class declaration after statements');
          cppFile.addDeclaration(this.parseClassDeclaration(node as ts.ClassDeclaration));
          return;
        case ts.SyntaxKind.FunctionDeclaration:
          if (!cppFile.canAddDeclaration())
            throw new UnsupportedError(node, 'Can not add function declaration after statements');
          cppFile.addDeclaration(this.parseFunctionDeclaration(node as ts.FunctionDeclaration));
          return;
        case ts.SyntaxKind.VariableStatement:
          cppFile.addVariableStatement(this.parseStatement(node as ts.Statement) as syntax.VariableStatement);
          return;
        case ts.SyntaxKind.Block:
        case ts.SyntaxKind.ExpressionStatement:
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ReturnStatement:
          if (cppFile.type == 'lib')
            throw new UnsupportedError(node, 'In C++ only class and function declarations can be made top-level, unless it is the main script');
          cppFile.addStatement(this.parseStatement(node as ts.Statement));
          return;
        case ts.SyntaxKind.EndOfFileToken:
          cppFile.endOfFile();
          return;
        // The interfaces are parsed on the fly when we see object literals.
        case ts.SyntaxKind.InterfaceDeclaration:
        // We don't need to parse type alias, typeChecker does it for us.
        case ts.SyntaxKind.TypeAliasDeclaration:
        // This is for the ; added on unnecessary places.
        case ts.SyntaxKind.EmptyStatement:
          return;
      }
      throw new UnimplementedError(node, 'Unsupported top-level node');
    });
    return cppFile;
  }

  parseExpression(node: ts.Expression): syntax.Expression {
    switch (node.kind) {
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
        return new syntax.RawExpression(syntax.Type.createBooleanType(),
                                        node.getText());
      case ts.SyntaxKind.ThisKeyword:
        return new syntax.RawExpression(this.typer.parseNodeType(node),
                                        node.getText());
      case ts.SyntaxKind.NullKeyword:
        return new syntax.NullKeyword();
      case ts.SyntaxKind.SuperKeyword:
        return new syntax.BaseResolutionExpression(this.typer.parseNodeType(node));
      case ts.SyntaxKind.NumericLiteral:
        return new syntax.NumericLiteral(node.getText());
      case ts.SyntaxKind.StringLiteral:
        return new syntax.StringLiteral((node as ts.StringLiteral).text);
      case ts.SyntaxKind.Identifier: {
        const type = this.typer.parseNodeType(node);
        if (type.category == 'undefined')
          return new syntax.UndefinedKeyword();
        else
          return new syntax.Identifier(type, node.getText(), this.typer.getNodeNamespace(node))
      }
      case ts.SyntaxKind.TemplateExpression: {
        // `prefix${value}`
        const {head, templateSpans} = node as ts.TemplateExpression;
        const spans: syntax.Expression[] = [];
        spans.push(new syntax.StringLiteral(head.text));
        for (const span of templateSpans) {
          if (span.literal.text)
            spans.push(new syntax.StringLiteral(span.literal.text));
          spans.push(this.parseExpression(span.expression));
        }
        return new syntax.StringConcatenation(spans);
      }
      case ts.SyntaxKind.AsExpression: {
        // b as boolean
        const {type, expression} = node as ts.AsExpression;
        return new syntax.AsExpression(this.typer.parseNodeType(type),
                                       this.parseExpression(expression));
      }
      case ts.SyntaxKind.NonNullExpression: {
        // a!
        const {expression} = node as ts.NonNullExpression;
        return new syntax.NonNullExpression(this.parseExpression(expression));
      }
      case ts.SyntaxKind.ParenthesizedExpression: {
        // (a + b) * (c + d)
        const {expression} = node as ts.ParenthesizedExpression;
        return new syntax.ParenthesizedExpression(this.parseExpression(expression));
      }
      case ts.SyntaxKind.ExpressionWithTypeArguments: {
        // expr<type>
        const {expression, typeArguments} = node as ts.ExpressionWithTypeArguments;
        if (!ts.isIdentifier(expression))
          throw new UnimplementedError(node, 'The type arguments must be applied on an identifier');
        const templateArguments = typeArguments?.map(a => this.typer.parseNodeType(a));
        return new syntax.ExpressionWithTemplateArguments(this.typer.parseNodeType(node),
                                                          this.parseExpression(expression),
                                                          templateArguments);
      }
      case ts.SyntaxKind.PostfixUnaryExpression: {
        // a++
        const {operand, operator} = node as ts.PostfixUnaryExpression;
        return new syntax.PostfixUnaryExpression(this.typer.parseNodeType(node),
                                                 this.parseExpression(operand),
                                                 operatorToString(operator));
      }
      case ts.SyntaxKind.PrefixUnaryExpression: {
        // ++a
        const {operand, operator} = node as ts.PrefixUnaryExpression;
        return new syntax.PrefixUnaryExpression(this.typer.parseNodeType(node),
                                                this.parseExpression(operand),
                                                operatorToString(operator));
      }
      case ts.SyntaxKind.ConditionalExpression: {
        // a ? b : c
        const {condition, whenTrue, whenFalse} = node as ts.ConditionalExpression;
        return new syntax.ConditionalExpression(this.typer.parseNodeType(node),
                                                this.parseExpression(condition),
                                                this.parseExpression(whenTrue),
                                                this.parseExpression(whenFalse));
      }
      case ts.SyntaxKind.BinaryExpression: {
        // a + b
        return this.parseBinaryExpression(node as ts.BinaryExpression);
      }
      case ts.SyntaxKind.ArrayLiteralExpression: {
        // [1, 2, 3, 4]
        const {elements} = node as ts.ArrayLiteralExpression;
        return new syntax.ArrayLiteralExpression(this.typer.parseNodeType(node),
                                                 elements.map(this.parseExpression.bind(this)));
      }
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression: {
        // function() { xxx }
        return this.parseFunctionExpression(node as ts.FunctionExpression | ts.ArrowFunction);
      }
      case ts.SyntaxKind.CallExpression: {
        // func(xxx)
        return this.parseCallExpression(node as ts.CallExpression);
      }
      case ts.SyntaxKind.NewExpression: {
        // new Class(xxx)
        const newExpression = node as ts.NewExpression;
        const args = newExpression['arguments'];  // arguments is a keyword
        if (!ts.isIdentifier(newExpression.expression))
          throw new UnsupportedError(node, 'The new operator only accepts class name');
        return new syntax.NewExpression(this.typer.parseNodeType(node),
                                        this.parseArguments(newExpression, args));
      }
      case ts.SyntaxKind.ObjectLiteralExpression: {
        // {prop: value}
        return this.parseObjectLiteral(node as ts.ObjectLiteralExpression);
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        // obj.prop
        return this.parsePropertyAccessExpression(node as ts.PropertyAccessExpression);
      }
      case ts.SyntaxKind.ElementAccessExpression: {
        // arr[0]
        const {expression, argumentExpression, questionDotToken} = node as ts.ElementAccessExpression;
        if (questionDotToken)
          throw new UnimplementedError(node, 'The ?.[] operator is not supported');
        return new syntax.ElementAccessExpression(this.typer.parseNodeType(node),
                                                  this.parseExpression(expression),
                                                  this.parseExpression(argumentExpression));
      }
    }
    throw new UnimplementedError(node, 'Unsupported expression');
  }

  parseBinaryExpression(node: ts.BinaryExpression): syntax.Expression {
    const {left, right, operatorToken} = node;
    const cppLeft = this.parseExpression(left);
    const cppRight = this.parseExpression(right);
    // Handle string concatenation specially.
    if (operatorToken.kind == ts.SyntaxKind.PlusToken) {
      // Left hand is a string concatenation.
      if (cppLeft instanceof syntax.StringConcatenation)
        return new syntax.StringConcatenation([ ...cppLeft.spans, cppRight ]);
      // Concatenate string with any type results in a string.
      if (cppLeft.type.category == 'string' || cppRight.type.category == 'string')
        return new syntax.StringConcatenation([ cppLeft, cppRight ]);
    }
    const operator = operatorToken.getText();
    switch (operatorToken.kind) {
      case ts.SyntaxKind.AmpersandAmpersandToken:
      case ts.SyntaxKind.BarBarToken:
        // a && b
        return new syntax.BinaryExpression(syntax.Type.createBooleanType(),
                                           new syntax.Condition(cppLeft),
                                           new syntax.Condition(cppRight),
                                           operator);
      case ts.SyntaxKind.GreaterThanToken:
      case ts.SyntaxKind.GreaterThanEqualsToken:
      case ts.SyntaxKind.LessThanToken:
      case ts.SyntaxKind.LessThanEqualsToken:
      case ts.SyntaxKind.EqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        // a == b
        return new syntax.ComparisonExpression(cppLeft, cppRight, operator);
      case ts.SyntaxKind.EqualsToken:
        // a = b
        return new syntax.AssignmentExpression(cppLeft, cppRight);
      case ts.SyntaxKind.PercentToken:
        // a % b
        return new syntax.ModExpression(cppLeft, cppRight);
      default:
        return new syntax.BinaryExpression(this.typer.parseNodeType(node),
                                           cppLeft,
                                           cppRight,
                                           operator);
    }
  }

  parseStatement(node: ts.Statement): syntax.Statement {
    switch (node.kind) {
      case ts.SyntaxKind.Block: {
        // { xxx; yyy; zzz; }
        const {statements} = node as ts.Block;
        return new syntax.Block(statements.map(this.parseStatement.bind(this)));
      }
      case ts.SyntaxKind.VariableStatement: {
        // let a = xxx, b = xxx;
        const {declarationList} = node as ts.VariableStatement;
        return new syntax.VariableStatement(this.parseVariableDeclarationList(declarationList));
      }
      case ts.SyntaxKind.ExpressionStatement: {
        // xxxx;
        const expr = this.parseExpression((node as ts.ExpressionStatement).expression);
        return new syntax.ExpressionStatement(expr);
      }
      case ts.SyntaxKind.IfStatement: {
        // if (xxx) { yyy } else { zzz }
        const {expression, thenStatement, elseStatement} = node as ts.IfStatement;
        return new syntax.IfStatement(this.parseExpression(expression),
                                      this.parseStatement(thenStatement),
                                      elseStatement ? this.parseStatement(elseStatement) : undefined);
      }
      case ts.SyntaxKind.DoStatement: {
        // do { xxx } while (yyy)
        const {expression, statement} = node as ts.DoStatement;
        return new syntax.DoStatement(this.parseStatement(statement),
                                      this.parseExpression(expression));
      }
      case ts.SyntaxKind.WhileStatement: {
        // while (yyy) { xxx }
        const {expression, statement} = node as ts.WhileStatement;
        return new syntax.WhileStatement(this.parseStatement(statement),
                                      this.parseExpression(expression));
      }
      case ts.SyntaxKind.ForStatement: {
        // for (let i = 0; i < N; ++i) { xxx }
        const {initializer, condition, incrementor, statement} = node as ts.ForStatement;
        let init: undefined | syntax.VariableDeclarationList | syntax.Expression;
        if (initializer) {
          if (initializer?.kind == ts.SyntaxKind.VariableDeclarationList)
            init = this.parseVariableDeclarationList(initializer as ts.VariableDeclarationList);
          else
            init = this.parseExpression(initializer as ts.Expression);
        }
        return new syntax.ForStatement(this.parseStatement(statement),
                                       init,
                                       condition ? this.parseExpression(condition) : undefined,
                                       incrementor ? this.parseExpression(incrementor) : undefined);
      }
      case ts.SyntaxKind.ReturnStatement: {
        // return xxx
        const {expression} = node as ts.ReturnStatement;
        let returnType = syntax.Type.createVoidType();
        if (expression) {
          const func = ts.findAncestor(node.parent, isFunctionLikeNode);
          if (!func)
            throw new UnsupportedError(node, 'Can not find the function return type of return statement');
          returnType = (this.typer.parseNodeType(func) as syntax.FunctionType).returnType;
        }
        return new syntax.ReturnStatement(expression ? this.parseExpression(expression) : undefined,
                                          returnType);
      }
      case ts.SyntaxKind.ForInStatement:
        throw new UnimplementedError(node, 'The for...in loop is not supported');
      case ts.SyntaxKind.ForOfStatement:
        throw new UnimplementedError(node, 'The for...of loop is not supported');
      case ts.SyntaxKind.ClassDeclaration:
        throw new UnsupportedError(node, 'C++ only supports top-level classes');
      case ts.SyntaxKind.FunctionDeclaration:
        throw new UnsupportedError(node, 'C++ only supports top-level functions');
    }
    throw new UnimplementedError(node, 'Unsupported statement');
  }

  parseImportDeclaration(node: ts.ImportDeclaration): syntax.ImportDeclaration {
    const {importClause, moduleSpecifier} = node;
    if (!ts.isStringLiteral(moduleSpecifier))
      throw new UnsupportedError(node, 'Module name must be string literal');
    const fileName = getFileNameFromModuleSpecifier(moduleSpecifier.text);
    const decl = new syntax.ImportDeclaration(fileName, getNamespaceFromFileName(fileName));
    // import 'module'
    if (!importClause)
      return decl;
    const {name, namedBindings} = importClause;
    if (!name && !namedBindings)
      throw new UnimplementedError(node, 'Import module without names is not supported');
    // import xxx from 'module'
    if (name)
      throw new UnimplementedError(node, 'Default import has not been implemented');
    if (namedBindings) {
      if (ts.isNamedImports(namedBindings)) {
        // import {A, B, C} from 'module'
        const {elements} = namedBindings;
        decl.names = elements.filter(e => !e.propertyName)
                             .map(e => e.name.text);
        decl.aliases = elements.filter(e => e.propertyName)
                               .map(e => [ e.propertyName!.text, e.name.text ]);
      } else {
        // import * as xxx from 'module'
        decl.namespaceAlias = namedBindings.name.text;
      }
    }
    return decl;
  }

  parseVariableDeclarationList(node: ts.VariableDeclarationList): syntax.VariableDeclarationList {
    const decls = node.declarations.map(this.parseVariableDeclaration.bind(this));
    // In C++ all variables in one declaration use the same type.
    const {type} = decls[0];
    if (!decls.every(d => type.equal(d.type)))
      throw new UnimplementedError(node, 'Variable declaration list must use same type');
    return new syntax.VariableDeclarationList(decls);
  }

  parseVariableDeclaration(node: ts.VariableDeclaration): syntax.VariableDeclaration {
    switch (node.name.kind) {
      case ts.SyntaxKind.Identifier:
        // let a = xxx;
        const {name, type} = node;
        const cppType = this.typer.parseNodeType(type ?? name);
        if (type)  // the type modifiers should come from original declaration
          cppType.setModifiers(this.typer.getTypeModifiers(node));
        if (cppType.category == 'any')
          throw new UnsupportedError(node, 'Can not declare a variable type as any');
        if (isTemplateFunctor(cppType))
          throw new UnsupportedError(node, 'Can not declare a variable with type of generic function');
        if (node.initializer) {
          // let a = 123;
          const initializer = this.parseExpression(node.initializer);
          if (isTemplateFunctor(initializer.type))
            throw new UnsupportedError(node, 'Can not assign a generic function to a variable');
          return new syntax.VariableDeclaration(name.text, cppType, initializer);
        } else {
          // let a;
          return new syntax.VariableDeclaration(name.text, cppType);
        }
    }
    throw new UnimplementedError(node, 'Unsupported variable declaration');
  }

  parseFunctionDeclaration(node: ts.FunctionDeclaration): syntax.FunctionDeclaration {
    if (!node.name)
      throw new UnimplementedError(node, 'Empty function name is not supported');
    if (node.asteriskToken)
      throw new UnimplementedError(node, 'Generator is not supported');
    if (node.questionToken)
      throw new UnimplementedError(node, 'Question token in function is not supported');
    if (node.exclamationToken)
      throw new UnimplementedError(node, 'Exclamation token in function is not supported');
    if (node.modifiers?.find(m => m.kind == ts.SyntaxKind.AsyncKeyword))
      throw new UnimplementedError(node, 'Async function is not supported');
    if (!ts.isSourceFile(node.parent))
      throw new UnimplementedError(node, 'Local function declaration is not supported');
    const {body, name, parameters} = node;
    this.typer.forbidClosure(node);
    return new syntax.FunctionDeclaration(this.typer.parseNodeType(node) as syntax.FunctionType,
                                          isExportedDeclaration(node),
                                          name.text,
                                          this.parseParameters(parameters),
                                          body ? this.parseStatement(body) as syntax.Block : undefined);
  }

  parseFunctionExpression(node: ts.FunctionExpression | ts.ArrowFunction): syntax.FunctionExpression {
    const {body, parameters, modifiers, asteriskToken, exclamationToken, questionToken, typeParameters} = node;
    if (asteriskToken)
      throw new UnimplementedError(node, 'Generator is not supported');
    if (questionToken)
      throw new UnimplementedError(node, 'Question token in function is not supported');
    if (exclamationToken)
      throw new UnimplementedError(node, 'Exclamation token in function is not supported');
    if (typeParameters)
      throw new UnimplementedError(node, 'Generic function is not supported');
    if (modifiers?.find(m => m.kind == ts.SyntaxKind.AsyncKeyword))
      throw new UnimplementedError(node, 'Async function is not supported');
    let cppBody: undefined | syntax.Block;
    if (body) {
      if (ts.isBlock(body)) {
        cppBody = this.parseStatement(body) as syntax.Block;
      } else {
        // Arrow function may use expression as body, convert it to block.
        cppBody = new syntax.Block([
          new syntax.ReturnStatement(this.parseExpression(body)),
        ]);
      }
    }
    const closure = this.typer.getCapturedIdentifiers(node)
                              .map(n => this.parseExpression(n))
                              .filter(e => e.type.hasObject());
    return new syntax.FunctionExpression(this.typer.parseNodeType(node) as syntax.FunctionType,
                                         parameters.map(this.parseParameterDeclaration.bind(this)),
                                         closure,
                                         cppBody);
  }

  parseParameters(parameters: ts.NodeArray<ts.ParameterDeclaration> | ts.ParameterDeclaration[]): syntax.ParameterDeclaration[] {
    return parameters.map(this.parseParameterDeclaration.bind(this));
  }

  parseParameterDeclaration(node: ts.ParameterDeclaration): syntax.ParameterDeclaration {
    const {name, initializer} = node;
    if (!ts.isIdentifier(name))
      throw new UnimplementedError(node, 'Binding in parameter is not supported');
    const cppType = this.typer.parseNodeType(name);
    if (cppType.category == 'any')
      throw new UnsupportedError(node, 'Can not declare parameter type as any');
    return new syntax.ParameterDeclaration(name.text,
                                           cppType,
                                           initializer ? this.parseExpression(initializer) : undefined);
  }

  parseClassDeclaration(node: ts.ClassDeclaration): syntax.ClassDeclaration {
    const {name, members} = node;
    if (!name)
      throw new UnimplementedError(node, 'Empty class name is not supported');
    const cppMembers = members.map(this.parseClassElement.bind(this, node));
    const classDeclaration = new syntax.ClassDeclaration(this.typer.parseNodeType(node),
                                                         isExportedDeclaration(node),
                                                         cppMembers);
    cppMembers.forEach(m => m.classDeclaration = classDeclaration);
    return classDeclaration;
  }

  parseClassElement(classDeclaration: ts.ClassDeclaration,
                    node: ts.ClassElement): syntax.ClassElement {
    switch (node.kind) {
      case ts.SyntaxKind.Constructor: {
        // constructor(xxx) { yyy }
        return this.parseConstructorDeclaration(classDeclaration, node as ts.ConstructorDeclaration);
      }
      case ts.SyntaxKind.PropertyDeclaration: {
        // prop: type = xxx;
        const {modifiers, name, initializer} = node as ts.PropertyDeclaration;
        if (!ts.isIdentifier(name))
          throw new UnimplementedError(name, 'Only identifier can be used as property name');
        return new syntax.PropertyDeclaration(name.text,
                                              modifiers?.map(modifierToString) ?? [],
                                              this.typer.parseNodeType(name),
                                              initializer ? this.parseExpression(initializer) : undefined);
      }
      case ts.SyntaxKind.MethodDeclaration: {
        // method() { xxx }
        const {modifiers, name, body, parameters, questionToken, typeParameters} = node as ts.MethodDeclaration;
        if (!ts.isIdentifier(name))
          throw new UnsupportedError(name, 'Only identifier can be used as method name');
        if (questionToken)
          throw new UnsupportedError(name, 'Can not use question token in method');
        if (typeParameters)
          throw new UnimplementedError(name, 'Generic method is not supported');
        if (modifiers?.find(m => m.kind == ts.SyntaxKind.AsyncKeyword))
          throw new UnimplementedError(node, 'Async function is not supported');
        this.typer.forbidClosure(node as ts.MethodDeclaration);
        const cppModifiers = modifiers?.map(modifierToString) ?? [];
        cppModifiers.push(...parseHint(node));
        // In TypeScript every method is "virtual", while it is possible to
        // lookup all derived classes to decide whether to make the method
        // virtual, it is not worth the efforts.
        if (!cppModifiers.includes('static') &&
            !cppModifiers.includes('override') &&
            !cppModifiers.includes('destructor')) {
          cppModifiers.push('virtual');
        }
        return new syntax.MethodDeclaration(this.typer.parseNodeType(node) as syntax.FunctionType,
                                            name.text,
                                            cppModifiers,
                                            this.parseParameters(parameters),
                                            body ? this.parseStatement(body) as syntax.Block : undefined);
      }
      case ts.SyntaxKind.SemicolonClassElement:
        return new syntax.SemicolonClassElement();
    }
    throw new UnimplementedError(node, 'Unsupported class element');
  }

  parseConstructorDeclaration(classDeclaration: ts.ClassDeclaration, node: ts.ConstructorDeclaration): syntax.ConstructorDeclaration {
    let {body, parameters} = node;
    this.typer.forbidClosure(node as ts.ConstructorDeclaration);
    let baseCall: syntax.CallArguments | undefined;
    if (body) {
      // The super call can only be used as the first statement.
      const superCall = filterNode(body, (node) => ts.isCallExpression(node) && node.expression.kind == ts.SyntaxKind.SuperKeyword) as ts.CallExpression[];
      if (superCall.length == 1) {
        const firstStatement = body.statements[0];
        if (!ts.isExpressionStatement(firstStatement) ||
            !ts.isCallExpression(firstStatement.expression) ||
            superCall[0] != firstStatement.expression) {
          throw new UnimplementedError(superCall[0], 'The super call must be placed as the first statement in body');
        }
        // Convert the super call to C++.
        baseCall = this.parseArguments(superCall[0], superCall[0]['arguments']);
        // Remove the super call from body.
        body = ts.factory.createBlock(body.statements.slice(1));
      } else if (superCall.length > 1) {
        throw new UnimplementedError(superCall[1], 'The super call can only be called once');
      }
    }
    return new syntax.ConstructorDeclaration(classDeclaration.name!.text,
                                             this.parseParameters(parameters),
                                             body ? this.parseStatement(body) as syntax.Block : undefined,
                                             baseCall);
  }

  parseObjectLiteral(node: ts.ObjectLiteralExpression): syntax.ObjectLiteral {
    const initializers = new Map<string, syntax.Expression>();
    for (const element of node.properties) {
      if (ts.isMethodDeclaration(element))
        throw new UnsupportedError(element, 'Method declaration in object literal is not supported');
      if (!ts.isPropertyAssignment(element))
        throw new UnsupportedError(element, 'Unsupported property type');
      if (!ts.isIdentifier(element.name))
        throw new UnsupportedError(element, 'Unsupported property name');
      initializers.set(element.name.text, this.parseExpression(element.initializer));
    }
    return new syntax.ObjectLiteral(this.typer.parseNodeType(node) as syntax.InterfaceType,
                                    initializers);
  }

  parsePropertyAccessExpression(node: ts.PropertyAccessExpression): syntax.Expression {
    const {expression, name, questionDotToken} = node;
    if (questionDotToken)
      throw new UnimplementedError(node, 'The ?. operator is not supported');
    if (!ts.isIdentifier(name))
      throw new UnimplementedError(name, 'Only identifier can be used as member name');
    if (name.text == 'prototype')
      throw new UnsupportedError(node, 'Can not access prototype of class');
    // In TypeScript accessing a module's exports is treated as accessing
    // properties of the exported object. To translate it to C++, we treat
    // such PropertyAccessExpression as namespace calls.
    if (ts.isIdentifier(expression) &&
        isModuleImports(this.typer.typeChecker.getTypeAtLocation(expression))) {
      const identifier = this.parseExpression(name) as syntax.Identifier;
      identifier.namespace = expression.text;
      return identifier;
    }
    // In TypeScript all types can have properties, we have not implemented
    // for all types yet.
    const obj = this.parseExpression(expression);
    if (!obj.type.isObject() &&
        obj.type.category != 'string' &&
        obj.type.category != 'namespace' &&
        obj.type.category != 'union') {
      throw new UnimplementedError(node, 'Only support accessing properties of objects');
    }
    if (name.text == '__proto__')
      throw new UnsupportedError(node, 'Can not access prototype of object');
    return new syntax.PropertyAccessExpression(this.typer.parseNodeType(node),
                                               obj,
                                               name.text);
  }

  parseCallExpression(node: ts.CallExpression): syntax.Expression {
    const {expression, questionDotToken} = node;
    if (questionDotToken)
      throw new UnimplementedError(node, 'The ?. operator is not supported');
    const type = this.typer.parseNodeType(node);
    const callee = this.parseExpression(expression);
    const args = this.parseArguments(node, node['arguments']);
    // Get the type of the resolved function signature, which is used for
    // inferring the type arguments when calling generic functions.
    const signature = this.typer.typeChecker.getResolvedSignature(node);
    if (!signature)
      throw new UnsupportedError(node, 'Can not get resolved signature');
    const resolvedFunctionType = this.typer.parseSignatureType(signature, node);
    // Update function type with resolved signature's name and templates.
    if (callee.type.category == 'functor')
      callee.type.name = resolvedFunctionType.name;
    callee.type.templateArguments = resolvedFunctionType.templateArguments;
    // Method is handled differently from the normal function.
    if (ts.isPropertyAccessExpression(expression) && callee.type.category == 'method')
      return new syntax.MethodCallExpression(type, callee as syntax.PropertyAccessExpression, args);
    else
      return new syntax.CallExpression(type, callee, args);
  }

  parseArguments(node: ts.CallLikeExpression,
                 args?: ts.NodeArray<ts.Expression>): syntax.CallArguments {
    if (!args)
      return new syntax.CallArguments([], []);
    const signature = this.typer.typeChecker.getResolvedSignature(node);
    if (!signature)
      throw new UnimplementedError(node, 'Can not get resolved signature');
    return new syntax.CallArguments(args.map(this.parseExpression.bind(this)),
                                    this.typer.parseSignatureParameters(signature.parameters, node));
  }
}
