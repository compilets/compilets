import path from 'node:path';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import CppProject from './cpp-project';
import * as syntax from './cpp-syntax';

import {
  UnimplementedError,
  UnsupportedError,
  operatorToString,
  modifierToString,
  FunctionLikeNode,
  isFunctionLikeNode,
  isFunction,
  isTemplateFunctor,
  isClass,
  isInterface,
  hasQuestionToken,
  hasTypeNode,
  filterNode,
  parseHint,
  parseNodeJsType,
  uniqueArray,
} from './parser-utils';

/**
 * Convert TypeScript AST to C++ source code.
 */
export default class Parser {
  project: CppProject;
  program: ts.Program;
  typeChecker: ts.TypeChecker;
  interfaceRegistry = new syntax.InterfaceRegistry();

  constructor(project: CppProject) {
    if (project.files.size > 0)
      throw new Error('The project has already been parsed');
    this.project = project;
    this.program = ts.createProgram(project.fileNames, project.compilerOptions);
    this.typeChecker = this.program.getTypeChecker();
  }

  parse() {
    for (const fileName of this.program.getRootFileNames()) {
      const name = path.relative(this.project.rootDir, fileName)
                       .replace(/.ts$/, '.cpp');
      const isMain = fileName == this.project.mainFileName;
      const sourceFile = this.program.getSourceFile(fileName)!;
      this.project.addFile(name, this.parseSourceFile(isMain, sourceFile));
    }
  }

  parseSourceFile(isMain: boolean, sourceFile: ts.SourceFile): CppFile {
    const cppFile = new CppFile(isMain);
    ts.forEachChild(sourceFile, (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.InterfaceDeclaration:
          this.parseNodeType(node);
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
        case ts.SyntaxKind.Block:
        case ts.SyntaxKind.VariableStatement:
        case ts.SyntaxKind.ExpressionStatement:
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ReturnStatement:
          if (!cppFile.isMain)
            throw new UnsupportedError(node, 'In C++ only class and function declarations can be made top-level, unless it is the main script');
          cppFile.addStatement(this.parseStatement(node as ts.Statement));
          return;
        case ts.SyntaxKind.EmptyStatement:
        case ts.SyntaxKind.EndOfFileToken:
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
        return new syntax.RawExpression(new syntax.Type('bool', 'primitive'),
                                        node.getText());
      case ts.SyntaxKind.ThisKeyword:
        return new syntax.RawExpression(this.parseNodeType(node),
                                        node.getText());
      case ts.SyntaxKind.NullKeyword:
        return new syntax.RawExpression(new syntax.Type('null', 'null'),
                                        'nullptr');
      case ts.SyntaxKind.SuperKeyword:
        return new syntax.BaseResolutionExpression(this.parseNodeType(node));
      case ts.SyntaxKind.NumericLiteral:
        return new syntax.NumericLiteral(node.getText());
      case ts.SyntaxKind.StringLiteral:
        return new syntax.StringLiteral((node as ts.StringLiteral).text);
      case ts.SyntaxKind.Identifier: {
        const type = this.parseNodeType(node);
        const text = type.category == 'null' ? 'nullptr' : node.getText();
        const isExternal = this.getOriginalDeclaration(node)?.getSourceFile().isDeclarationFile == true;
        return new syntax.Identifier(type, text, isExternal);
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
        return new syntax.AsExpression(this.parseNodeType(type),
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
        const templateArguments = typeArguments?.map(a => this.parseNodeType(a));
        return new syntax.ExpressionWithTemplateArguments(this.parseNodeType(node),
                                                          this.parseExpression(expression),
                                                          templateArguments);
      }
      case ts.SyntaxKind.PostfixUnaryExpression: {
        // a++
        const {operand, operator} = node as ts.PostfixUnaryExpression;
        return new syntax.PostfixUnaryExpression(this.parseNodeType(node),
                                                 this.parseExpression(operand),
                                                 operatorToString(operator));
      }
      case ts.SyntaxKind.PrefixUnaryExpression: {
        // ++a
        const {operand, operator} = node as ts.PrefixUnaryExpression;
        return new syntax.PrefixUnaryExpression(this.parseNodeType(node),
                                                this.parseExpression(operand),
                                                operatorToString(operator));
      }
      case ts.SyntaxKind.ConditionalExpression: {
        // a ? b : c
        const {condition, whenTrue, whenFalse} = node as ts.ConditionalExpression;
        return new syntax.ConditionalExpression(this.parseNodeType(node),
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
        return new syntax.ArrayLiteralExpression(this.parseNodeType(node),
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
        return new syntax.NewExpression(this.parseNodeType(node),
                                        this.parseArguments(newExpression, args));
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        // obj.prop
        const {expression, name, questionDotToken} = node as ts.PropertyAccessExpression;
        if (questionDotToken)
          throw new UnimplementedError(node, 'The ?. operator is not supported');
        if (!ts.isIdentifier(name))
          throw new UnimplementedError(name, 'Only identifier can be used as member name');
        const obj = this.parseExpression(expression);
        if (!obj.type.isObject() && obj.type.category != 'string')
          throw new UnimplementedError(name, 'Only support accessing properties of class');
        return new syntax.PropertyAccessExpression(this.parseNodeType(node),
                                                   obj,
                                                   (name as ts.Identifier).text);
      }
      case ts.SyntaxKind.ElementAccessExpression: {
        // arr[0]
        const {expression, argumentExpression, questionDotToken} = node as ts.ElementAccessExpression;
        if (questionDotToken)
          throw new UnimplementedError(node, 'The ?.[] operator is not supported');
        return new syntax.ElementAccessExpression(this.parseNodeType(node),
                                                  this.parseExpression(expression),
                                                  this.parseExpression(argumentExpression));
      }
    }
    throw new UnimplementedError(node, 'Unsupported expression');
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
        let returnType = new syntax.Type('void', 'void')
        if (expression) {
          const func = ts.findAncestor(node.parent, isFunctionLikeNode);
          if (!func)
            throw new UnsupportedError(node, 'Can not find the function return type of return statement');
          returnType = this.parseFunctionReturnType(func);
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
        const cppType = this.parseNodeType(type ?? name);
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
    this.forbidClosure(node);
    return new syntax.FunctionDeclaration(this.parseNodeType(node),
                                          name.text,
                                          this.parseFunctionReturnType(node),
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
    const closure = this.getCapturedIdentifiers(node).map(n => this.parseExpression(n))
                                                     .filter(e => e.type.hasObject());
    return new syntax.FunctionExpression(this.parseNodeType(node),
                                         this.parseFunctionReturnType(node),
                                         parameters.map(this.parseParameterDeclaration.bind(this)),
                                         closure,
                                         cppBody);
  }

  parseParameters(parameters: ts.NodeArray<ts.ParameterDeclaration> | ts.ParameterDeclaration[]): syntax.ParameterDeclaration[] {
    return parameters.map(this.parseParameterDeclaration.bind(this));
  }

  parseParameterDeclaration(node: ts.ParameterDeclaration): syntax.ParameterDeclaration {
    const {name, initializer} = node;
    if (name.kind != ts.SyntaxKind.Identifier)
      throw new UnimplementedError(node, 'Binding in parameter is not supported');
    return new syntax.ParameterDeclaration((name as ts.Identifier).text,
                                           this.parseNodeType(name),
                                           initializer ? this.parseExpression(initializer) : undefined);
  }

  parseClassDeclaration(node: ts.ClassDeclaration): syntax.ClassDeclaration {
    const {name, members} = node;
    if (!name)
      throw new UnimplementedError(node, 'Empty class name is not supported');
    const cppMembers = members.map(this.parseClassElement.bind(this, node));
    const classDeclaration = new syntax.ClassDeclaration(this.parseNodeType(node), cppMembers);
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
        if (name.kind != ts.SyntaxKind.Identifier)
          throw new UnimplementedError(name, 'Only identifier can be used as property name');
        return new syntax.PropertyDeclaration((name as ts.Identifier).text,
                                              modifiers?.map(modifierToString) ?? [],
                                              this.parseNodeType(name),
                                              initializer ? this.parseExpression(initializer) : undefined);
      }
      case ts.SyntaxKind.MethodDeclaration: {
        // method() { xxx }
        const {modifiers, name, body, parameters, questionToken, typeParameters} = node as ts.MethodDeclaration;
        if (name.kind != ts.SyntaxKind.Identifier)
          throw new UnsupportedError(name, 'Only identifier can be used as method name');
        if (questionToken)
          throw new UnsupportedError(name, 'Can not use question token in method');
        if (typeParameters)
          throw new UnimplementedError(name, 'Generic method is not supported');
        if (modifiers?.find(m => m.kind == ts.SyntaxKind.AsyncKeyword))
          throw new UnimplementedError(node, 'Async function is not supported');
        this.forbidClosure(node as ts.MethodDeclaration);
        const cppModifiers = modifiers?.map(modifierToString) ?? [];
        cppModifiers.push(...parseHint(node));
        // In TypeScript every method is "virtual", while it is possible to
        // lookup all derived classes to decide whether to make the method
        // virtual, it is not worth the efforts.
        if (!cppModifiers.includes('override') &&
            !cppModifiers.includes('destructor')) {
          cppModifiers.push('virtual');
        }
        return new syntax.MethodDeclaration((name as ts.Identifier).text,
                                            cppModifiers,
                                            this.parseFunctionReturnType(node),
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
    this.forbidClosure(node as ts.ConstructorDeclaration);
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

  parseBinaryExpression(node: ts.BinaryExpression): syntax.Expression {
    const {left, right, operatorToken} = node;
    const cppLeft = this.parseExpression(left);
    const cppRight = this.parseExpression(right);
    if (operatorToken.kind == ts.SyntaxKind.PlusToken) {
      // Concatenate 2 string literals.
      if (ts.isStringLiteral(left) && ts.isStringLiteral(right))
        return new syntax.StringConcatenation([ cppLeft, cppRight ]);
      // Left hand is a string concatenation.
      if (cppLeft instanceof syntax.StringConcatenation && cppRight.type.category == 'string')
        return new syntax.StringConcatenation([ ...cppLeft.spans, cppRight ]);
    }
    return new syntax.BinaryExpression(this.parseNodeType(node),
                                       cppLeft,
                                       cppRight,
                                       operatorToken.getText());
  }

  parseCallExpression(node: ts.CallExpression): syntax.Expression {
    const {expression, questionDotToken} = node;
    const args = node['arguments'];  // arguments is a keyword
    if (questionDotToken)
      throw new UnimplementedError(node, 'The ?. operator is not supported');
    // Resolve function type with the resolved signature of call expression,
    // required for inferring the type arguments when calling generic functions.
    const callee = this.parseExpression(expression);
    if (isFunction(this.typeChecker.getTypeAtLocation(expression))) {
      const signature = this.typeChecker.getResolvedSignature(node);
      if (signature) {
        const {name, templateArguments} = this.parseSignatureType(signature, node);
        Object.assign(callee.type, {name, templateArguments});
      }
    }
    return new syntax.CallExpression(this.parseNodeType(node),
                                     callee,
                                     this.parseArguments(node, args));
  }

  parseArguments(node: ts.CallLikeExpression,
                 args?: ts.NodeArray<ts.Expression>): syntax.CallArguments {
    if (!args)
      return new syntax.CallArguments([], []);
    const signature = this.typeChecker.getResolvedSignature(node);
    if (!signature)
      throw new UnimplementedError(node, 'Can not get resolved signature');
    return new syntax.CallArguments(args.map(this.parseExpression.bind(this)),
                                    this.parseSignatureParameters(signature.parameters, node));
  }

  /**
   * Parse the type of expression located at node to C++ type.
   */
  parseNodeType(node: ts.Node): syntax.Type {
    // Get modifiers of the type from original declaration.
    const decl = this.getOriginalDeclaration(node);
    const modifiers = this.getTypeModifiers(decl);
    // Get the node the represents the type of node, and query its type.
    const typeNode = decl ? this.getTypeNode(decl) : node;
    let type = this.typeChecker.getTypeAtLocation(typeNode);
    // If there is unknown type parameter in the type, rely on typeChecker to
    // resolve the type.
    if (typeNode != node && this.hasTypeParameter(type))
      type = this.typeChecker.getTypeAtLocation(node);
    // Check Node.js type.
    if (modifiers.includes('external')) {
      const nodeJsType = parseNodeJsType(node, type, modifiers);
      if (nodeJsType)
        return nodeJsType;
    }
    return this.parseTypeWithNode(type, node, modifiers);
  }

  /**
   * Wrap parseType with detailed error information.
   */
  parseTypeWithNode(type: ts.Type, node: ts.Node, modifiers?: syntax.TypeModifier[]): syntax.Type {
    try {
      return this.parseType(type, node, modifiers);
    } catch (error: unknown) {
      if (error instanceof Error)
        throw new UnimplementedError(node, error.message);
      else
        throw error;
    }
  }

  /**
   * Parse the type of symbol at location.
   */
  parseSymbolType(symbol: ts.Symbol, location: ts.Node, modifiers?: syntax.TypeModifier[]) {
    try {
      const type = this.typeChecker.getTypeOfSymbolAtLocation(symbol, location);
      return this.parseType(type, location, modifiers);
    } catch (error: unknown) {
      if (error instanceof Error)
        throw new UnimplementedError(location, error.message);
      else
        throw error;
    }
  }

  /**
   * Parse TypeScript type to C++ type.
   */
  parseType(type: ts.Type, location?: ts.Node, modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Check literals.
    if (type.isNumberLiteral())
      return syntax.Type.createNumberType(modifiers);
    if (type.isStringLiteral())
      return syntax.Type.createStringType(modifiers);
    // Check union.
    const name = this.typeChecker.typeToString(type);
    if (type.isUnion())
      return this.parseUnionType(name, type as ts.UnionType, location, modifiers);
    // Check type parameter.
    const flags = type.getFlags();
    if (flags & ts.TypeFlags.TypeParameter)
      return new syntax.Type(name, 'template', modifiers);
    // Check builtin types.
    if (flags & (ts.TypeFlags.Never | ts.TypeFlags.Void))
        return new syntax.Type(name, 'void', modifiers);
    if (flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
      return new syntax.Type(name, 'null', modifiers);
    if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral))
      return new syntax.Type('bool', 'primitive', modifiers);
    if (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral))
      return syntax.Type.createNumberType(modifiers);
    if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral))
      return syntax.Type.createStringType(modifiers);
    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))
      return new syntax.Type(name, 'any', modifiers);
    // Check array.
    if (this.typeChecker.isArrayType(type))
      return this.parseArrayType(name, type as ts.TypeReference, location, modifiers);
    // Check class.
    if (isClass(type))
      return this.parseClassType(type, location, modifiers);
    // Check interface.
    if (isInterface(type))
      return this.parseInterfaceType(type, location, modifiers);
    // Check function.
    if (isFunction(type)) {
      if (!location)
        throw new Error('Functions can only be parsed knowing its location');
      const signature = type.getCallSignatures()[0];
      return this.parseSignatureType(signature, location, modifiers);
    }
    throw new Error(`Unsupported type "${name}"`);
  }

  /**
   * Parse the type of function node's return value.
   */
  parseFunctionReturnType(node: ts.Node) {
    const type = this.typeChecker.getTypeAtLocation(node);
    const signature = type.getCallSignatures()[0];
    return this.parseTypeWithNode(signature.getReturnType(), node);
  }

  /**
   * Parse the function type.
   */
  parseSignatureType(signature: ts.Signature,
                     location: ts.Node,
                     modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Receive the C++ representations of returnType and parameters.
    const returnType = this.parseType(signature.getReturnType(), location);
    const parameters = this.parseSignatureParameters(signature.parameters, location);
    const ctx = new syntax.PrintContext('lib', 'header');
    const cppSignature = `${returnType.print(ctx)}(${parameters.map(p => p.print(ctx)).join(', ')})`;
    // Tell whether this is a function or functor.
    let category: syntax.TypeCategory;
    const {declaration} = signature;
    if (declaration) {
      if (ts.isFunctionExpression(declaration) ||
          ts.isArrowFunction(declaration) ||
          ts.isFunctionTypeNode(declaration)) {
        category = 'functor';
      } else {
        category = 'function';
      }
    } else {
      // Likely a function parameter.
      category = 'functor';
    }
    const cppType = new syntax.Type(cppSignature, category, modifiers);
    if (signature.typeParameters)
      cppType.types = signature.typeParameters.map(p => this.parseType(p));
    cppType.templateArguments = this.getTypeArgumentsOfSignature(signature)?.map(p => this.parseType(p));
    return cppType;
  }

  /**
   * Parse the types of signature parameters at the location.
   */
  parseSignatureParameters(parameters: readonly ts.Symbol[], location: ts.Node): syntax.Type[] {
    return parameters.map((parameter) => {
      // Get the modifiers from the original declaration.
      const modifiers = this.getTypeModifiers(parameter.valueDeclaration);
      // Inference the type using the symbol and call site.
      return this.parseSymbolType(parameter, location, modifiers);
    });
  }

  /**
   * Parse the class type.
   */
  parseClassType(type: ts.GenericType,
                 location?: ts.Node,
                 modifiers?: syntax.TypeModifier[]): syntax.Type {
    const cppType = new syntax.Type(type.symbol.name, 'class', modifiers);
    // Parse base classes.
    const base = type.getBaseTypes()?.find(isClass);
    if (base)
      cppType.base = this.parseType(base);
    if (type.typeParameters)
      cppType.types = type.typeParameters.map(p => this.parseType(p, location));
    cppType.templateArguments = type.typeArguments?.map(a => this.parseType(a, location));
    return cppType;
  }

  /**
   * Parse the interface type.
   */
  parseInterfaceType(type: ts.InterfaceType,
                     location?: ts.Node,
                     modifiers?: syntax.TypeModifier[]): syntax.InterfaceType {
    if (!location)
      throw new Error('Can not parse interface type without location');
    const cppType = new syntax.InterfaceType(type.symbol.name, modifiers);
    cppType.properties = new Map<string, syntax.Type>(type.getProperties().map(p => {
      const type = this.parseSymbolType(p, location);
      return [ p.name, type ];
    }));
    return this.interfaceRegistry.register(cppType);
  }

  /**
   * Parse the union type.
   */
  parseUnionType(name: string,
                 union: ts.UnionType,
                 location?: ts.Node,
                 modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Literal unions are treated as a single type.
    if (union.types.every(t => t.isNumberLiteral()))
      return syntax.Type.createNumberType(modifiers);
    if (union.types.every(t => t.isStringLiteral()))
      return syntax.Type.createStringType(modifiers);
    if (union.types.every(t => t.getFlags() & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)))
      return new syntax.Type('bool', 'primitive', modifiers);
    // Iterate all subtypes and add unique ones to cppType.
    let hasNull = false;
    let hasUndefined = false;
    let cppType = new syntax.Type(name, 'union', modifiers);
    for (const t of union.types) {
      const subtype = this.parseType(t, location, modifiers?.filter(m => m == 'property' || m == 'element'));
      if (subtype.category == 'null') {
        if (subtype.name == 'null')
          hasNull = true;
        else if (subtype.name == 'undefined')
          hasUndefined = true;
      }
      if (!cppType.types.find(s => s.equal(subtype)))
        cppType.types.push(subtype);
    }
    // Null and undefined are treated as the same thing in C++.
    if (hasNull && hasUndefined && !cppType.isExternal)
      throw new Error('Can not include both null and undefined in one union');
    if (hasNull || hasUndefined) {
      // Treat as optional type if type is something like "number | undefined".
      if (cppType.types.length == 2)
        cppType = cppType.types.find(t => t.category != 'null')!;
      cppType.isOptional = true;
    }
    // Make sure optional union type does not have null in the subtypes.
    if (cppType.category == 'union' && cppType.isOptional)
      cppType.types = cppType.types.filter(t => t.category != 'null');
    return cppType;
  }

  /**
   * Parse array type.
   */
  parseArrayType(name: string,
                 type: ts.TypeReference,
                 location?: ts.Node,
                 modifiers: syntax.TypeModifier[] = []): syntax.Type {
    const args = this.typeChecker.getTypeArguments(type);
    const cppType = new syntax.Type(name, 'array', modifiers);
    cppType.types = args.map(t => this.parseType(t, location, ['element', ...modifiers]));
    return cppType;
  }

  /**
   * Get the type modifiers from the declaration.
   */
  private getTypeModifiers(decl?: ts.Declaration): syntax.TypeModifier[] {
    const modifiers: syntax.TypeModifier[] = [];
    if (!decl)
      return modifiers;
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isParameter(decl)) {
      // Convert function to functor when the node is a variable.
      modifiers.push('not-function');
    }
    if (ts.isPropertyDeclaration(decl)) {
      modifiers.push('property');
      if ((decl as ts.PropertyDeclaration).modifiers?.some(m => m.kind == ts.SyntaxKind.StaticKeyword))
        modifiers.push('static');
    }
    if (ts.isParameter(decl) && decl.dotDotDotToken) {
      modifiers.push('variadic');
    }
    // For variable declaration, the comments are in the declarationList.
    const hintNode = ts.isVariableDeclaration(decl) ? decl.parent : decl;
    // Parse the hints in comments.
    for (const hint of parseHint(hintNode)) {
      if (hint == 'persistent')
        modifiers.push('persistent');
    }
    // The type is optional in 2 cases:
    // 1. The original decl has a question token.
    // 2. The original declaration has no type specified, and the root one
    //    has a question token.
    const root = this.getRootDeclaration(decl);
    if (hasQuestionToken(decl) ||
        (hasQuestionToken(root) && !hasTypeNode(decl))) {
      modifiers.push('optional');
    }
    // External type if declaration in in a d.ts file.
    if (root?.getSourceFile().isDeclarationFile) {
      modifiers.push('external');
    }
    return modifiers;
  }

  /**
   * Get a node that determines the type of the passed node.
   *
   * The result could be things like ts.TypeNode, literals, expressions, etc.
   */
  private getTypeNode(decl: ts.Declaration): ts.Declaration | ts.TypeNode | ts.Expression {
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isParameter(decl)) {
      const {type, initializer} = decl as ts.VariableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration;
      if (type) {
        return type;
      } else if (initializer) {
        const initDecl = this.getOriginalDeclaration(initializer);
        return initDecl ? this.getTypeNode(initDecl) : initializer;
      } else {
        throw new Error('Can not find type or initializer in the declaration');
      }
    }
    return decl;
  }

  /**
   * Like getTypeArguments but works for signature.
   *
   * We are abusing internals of TypeScript before there is an official API:
   * https://github.com/microsoft/TypeScript/issues/59637
   */
  getTypeArgumentsOfSignature(signature: ts.Signature): readonly ts.Type[] {
    const {mapper, target} = signature as unknown as {
      mapper: unknown,
      target: {typeParameters: unknown},
    };
    return this.typeChecker.getTypeArguments({
      node: {kind: ts.SyntaxKind.TypeReference},
      target: {
        outerTypeParameters: target?.typeParameters ?? [],
        localTypeParameters: [],
      },
      mapper,
    } as unknown as ts.TypeReference);
  }

  /**
   * Get the root declaration that decides the type of the passed declaration.
   *
   * For example, for `let a = object.prop`, this method returns the declaration
   * of `prop: type`.
   */
  private getRootDeclaration(decl?: ts.Declaration): ts.Declaration | undefined {
    if (!decl)
      return;
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isParameter(decl)) {
      const {type, initializer} = decl as ts.VariableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration;
      if (!type && initializer) {
        const initDecl = this.getOriginalDeclaration(initializer);
        if (initDecl)
          return this.getRootDeclaration(initDecl);
      }
    }
    return decl;
  }

  /**
   * Get the original declaration of a node.
   *
   * This is the declaration where the node's symbol is declared.
   */
  private getOriginalDeclaration(node: ts.Node): ts.Declaration | undefined {
    const symbol = this.typeChecker.getSymbolAtLocation(node);
    if (!symbol || !symbol.declarations || symbol.declarations.length == 0)
      return undefined;
    return symbol.declarations[0];
  }

  /**
   * Whether the type or its subtypes has type parameters in it.
   */
  private hasTypeParameter(type: ts.Type): boolean {
    if (type.isUnion())
      return type.types.some(this.hasTypeParameter.bind(this));
    if (type.isTypeParameter())
      return true;
    if (this.typeChecker.isArrayType(type))
      return this.typeChecker.getTypeArguments(type).some(this.hasTypeParameter.bind(this));
    return false;
  }

  /**
   * Throws error if the function uses closure.
   */
  private forbidClosure(node: FunctionLikeNode) {
    const captured = this.getCapturedIdentifiers(node);
    if (captured.length > 0) {
      const capturedNames = [...new Set(captured.map(i => `"${i.getText()}"`))].join(', ');
      throw new UnimplementedError(node, `Function declaration can not include reference to outer state: ${capturedNames}`);
    }
  }

  /**
   * Return the names and types of outer variables referenced by the function.
   */
  private getCapturedIdentifiers(func: FunctionLikeNode) {
    const closure: (ts.Identifier | ts.ThisExpression)[] = [];
    // Consider "this" as part of closure unless it is a method.
    let isVariable: (node: ts.Node) => boolean;
    if (ts.isConstructorDeclaration(func) ||
        ts.isMethodDeclaration(func) ||
        ts.isGetAccessor(func) ||
        ts.isSetAccessor(func)) {
      isVariable = ts.isIdentifier;
    } else {
      isVariable = (node: ts.Node) => ts.isIdentifier(node) || node.kind == ts.SyntaxKind.ThisKeyword;
    }
    // Iterate through all child nodes of function body.
    for (const node of filterNode(func.body, isVariable)) {
      // Keep references to "this".
      if (node.kind == ts.SyntaxKind.ThisKeyword) {
        closure.push(node as ts.ThisExpression);
        continue;
      }
      // Ignore symbols without definition.
      const symbol = this.typeChecker.getSymbolAtLocation(node);
      if (!symbol)
        throw new UnimplementedError(node, 'An identifier in function without symbol');
      const {valueDeclaration} = symbol;
      if (!valueDeclaration)
        continue;
      // References to globals and properties are fine.
      if (valueDeclaration.getSourceFile().isDeclarationFile ||
          ts.isClassDeclaration(valueDeclaration) ||
          ts.isFunctionDeclaration(valueDeclaration) ||
          ts.isPropertyDeclaration(valueDeclaration) ||
          ts.isMethodDeclaration(valueDeclaration) ||
          ts.isLiteralTypeNode(valueDeclaration)) {
        continue;
      }
      // Find identifiers not declared inside the function.
      if (!ts.findAncestor(symbol.valueDeclaration, (n) => n == func)) {
        closure.push(node as ts.Identifier);
      }
    }
    return uniqueArray(closure, (x, y) => x.getText() == y.getText());
  }
}
