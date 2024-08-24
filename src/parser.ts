import path from 'node:path';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import CppProject from './cpp-project';
import * as syntax from './cpp-syntax';

import {
  UnimplementedError,
  UnsupportedError,
  rethrowError,
  operatorToString,
  modifierToString,
  hasTypeNode,
  hasQuestionToken,
  isExternalDeclaration,
  isNodeJsDeclaration,
  isNodeJsType,
  FunctionLikeNode,
  isFunctionLikeNode,
  isFunction,
  isTemplateFunctor,
  isClass,
  isInterface,
  filterNode,
  parseHint,
  mergeTypes,
} from './parser-utils';
import {
  uniqueArray,
  createMapFromArray,
} from './js-utils';

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
    const cppFile = new CppFile(isMain, this.interfaceRegistry);
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
        return new syntax.RawExpression(syntax.Type.createBooleanType(),
                                        node.getText());
      case ts.SyntaxKind.ThisKeyword:
        return new syntax.RawExpression(this.parseNodeType(node),
                                        node.getText());
      case ts.SyntaxKind.NullKeyword:
        return new syntax.NullKeyword();
      case ts.SyntaxKind.SuperKeyword:
        return new syntax.BaseResolutionExpression(this.parseNodeType(node));
      case ts.SyntaxKind.NumericLiteral:
        return new syntax.NumericLiteral(node.getText());
      case ts.SyntaxKind.StringLiteral:
        return new syntax.StringLiteral((node as ts.StringLiteral).text);
      case ts.SyntaxKind.Identifier: {
        const type = this.parseNodeType(node);
        const text = type.category == 'null' ? 'nullptr' : node.getText();
        const isExternal = this.getOriginalDeclarations(node)?.some(isExternalDeclaration);
        return new syntax.Identifier(type, text, !!isExternal);
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
      case ts.SyntaxKind.ObjectLiteralExpression: {
        // {prop: value}
        return this.parseObjectLiteral(node as ts.ObjectLiteralExpression);
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        // obj.prop
        const {expression, name, questionDotToken} = node as ts.PropertyAccessExpression;
        if (questionDotToken)
          throw new UnimplementedError(node, 'The ?. operator is not supported');
        if (!ts.isIdentifier(name))
          throw new UnimplementedError(name, 'Only identifier can be used as member name');
        if (this.isSymbolClass(expression) && name.text == 'prototype')
          throw new UnsupportedError(node, 'Can not access prototype of class');
        const obj = this.parseExpression(expression);
        if (!obj.type.isObject() && obj.type.category != 'string' && obj.type.category != 'union')
          throw new UnimplementedError(node, 'Only support accessing properties of objects');
        if (name.text == '__proto__')
          throw new UnsupportedError(node, 'Can not access prototype of object');
        return new syntax.PropertyAccessExpression(this.parseNodeType(node),
                                                   obj,
                                                   name.text);
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
      default:
        return new syntax.BinaryExpression(this.parseNodeType(node),
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
          returnType = (this.parseNodeType(func) as syntax.FunctionType).returnType;
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
    return new syntax.FunctionDeclaration(this.parseNodeType(node) as syntax.FunctionType,
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
    const closure = this.getCapturedIdentifiers(node).map(n => this.parseExpression(n))
                                                     .filter(e => e.type.hasObject());
    return new syntax.FunctionExpression(this.parseNodeType(node) as syntax.FunctionType,
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
    return new syntax.ParameterDeclaration(name.text,
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
        if (!ts.isIdentifier(name))
          throw new UnimplementedError(name, 'Only identifier can be used as property name');
        return new syntax.PropertyDeclaration(name.text,
                                              modifiers?.map(modifierToString) ?? [],
                                              this.parseNodeType(name),
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
        return new syntax.MethodDeclaration(this.parseNodeType(node) as syntax.FunctionType,
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
    return new syntax.ObjectLiteral(this.parseNodeType(node) as syntax.InterfaceType,
                                    initializers);
  }

  parseCallExpression(node: ts.CallExpression): syntax.Expression {
    const {expression, questionDotToken} = node;
    if (questionDotToken)
      throw new UnimplementedError(node, 'The ?. operator is not supported');
    const type = this.parseNodeType(node);
    const callee = this.parseExpression(expression);
    const args = this.parseArguments(node, node['arguments']);
    // Get the type of the resolved function signature, which is used for
    // inferring the type arguments when calling generic functions.
    const signature = this.typeChecker.getResolvedSignature(node);
    if (!signature)
      throw new UnsupportedError(node, 'Can not get resolved signature');
    const resolvedFunctionType = this.parseSignatureType(signature, node);
    // Update function type with resolved signature's name and templates.
    callee.type.name = resolvedFunctionType.name;
    callee.type.templateArguments = resolvedFunctionType.templateArguments;
    // Method is handled differently from the normal function.
    if (ts.isPropertyAccessExpression(expression))
      return new syntax.MethodCallExpression(type, callee as syntax.PropertyAccessExpression, args);
    else
      return new syntax.CallExpression(type, callee, args);
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
    const decls = this.getOriginalDeclarations(node);
    // Rely on typeChecker for resolving type if there is no declaration.
    if (!decls)
      return this.parseTypeWithNode(this.typeChecker.getTypeAtLocation(node), node);
    // Parse the types of all declarations.
    let results: syntax.Type[] = [];
    for (const decl of decls) {
      // Get modifiers of the type from the declaration.
      const modifiers = this.getTypeModifiers(decl);
      // Compute the types of the declaration.
      let types = this.getTypeNodes(decl).map(node => this.typeChecker.getTypeAtLocation(node));
      // If there is unknown type parameter in the type, rely on typeChecker to
      // resolve the type instead, as our own type parser is not capable of
      // resolving type parameters yet.
      if (types.some(type => this.hasTypeParameter(type)))
        types = [ this.typeChecker.getTypeAtLocation(node) ];
      // Parse all the types.
      for (const type of types)
        results.push(this.parseTypeWithNode(type, node, modifiers));
    }
    // Some symbols have multiple declarations but our parser is not able to
    // distinguish the subtle differences.
    results = uniqueArray(results, (x, y) => x.equal(y));
    // When there are multiple types available, merge them to one. This can
    // happen when getting members from an union of objects.
    return mergeTypes(results);
  }

  /**
   * Parse the type of symbol at location.
   */
  parseSymbolType(symbol: ts.Symbol, location: ts.Node, modifiers?: syntax.TypeModifier[]) {
    try {
      const type = this.typeChecker.getTypeOfSymbolAtLocation(symbol, location);
      return this.parseType(type, location, modifiers);
    } catch (error) {
      rethrowError(location, error);
    }
  }

  /**
   * Wrap parseType with detailed error information.
   */
  parseTypeWithNode(type: ts.Type, node: ts.Node, modifiers?: syntax.TypeModifier[]): syntax.Type {
    try {
      return this.parseType(type, node, modifiers);
    } catch (error) {
      rethrowError(node, error);
    }
  }

  /**
   * Parse TypeScript type to C++ type.
   */
  parseType(type: ts.Type, location?: ts.Node, modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Check Node.js type.
    if (isNodeJsType(type)) {
      const result = this.parseNodeJsType(type, location);
      if (result)
        return result;
    }
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
      return syntax.Type.createVoidType(name, modifiers);
    if (flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
      return new syntax.Type(name, 'null', modifiers);
    if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral))
      return syntax.Type.createBooleanType(modifiers);
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
    // Check function.
    if (isFunction(type)) {
      if (!location)
        throw new Error('Functions can only be parsed knowing its location');
      const signature = type.getCallSignatures()[0];
      return this.parseSignatureType(signature, location, modifiers);
    }
    // Check interface.
    if (isInterface(type))
      return this.parseInterfaceType(type, location, modifiers);
    throw new Error(`Unsupported type "${name}"`);
  }

  /**
   * Parse the function type.
   */
  parseSignatureType(signature: ts.Signature,
                     location: ts.Node,
                     modifiers?: syntax.TypeModifier[]): syntax.FunctionType {
    // Tell whether this is a function or functor.
    let category: syntax.TypeCategory;
    const {declaration} = signature;
    if (declaration) {
      if (ts.isFunctionExpression(declaration) ||
          ts.isArrowFunction(declaration) ||
          ts.isFunctionTypeNode(declaration)) {
        category = 'functor';
      } else if (ts.isMethodDeclaration(declaration) ||
                 ts.isMethodSignature(declaration)) {
        category = 'method';
      } else {
        category = 'function';
      }
    } else {
      // Likely a function parameter.
      category = 'functor';
    }
    // Receive the C++ representations of returnType and parameters.
    const returnType = this.parseType(signature.getReturnType(), location);
    const parameters = this.parseSignatureParameters(signature.parameters, location);
    // Create the FunctionType.
    const cppType = new syntax.FunctionType(category, returnType, parameters, modifiers);
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
                     modifiers: syntax.TypeModifier[] = []): syntax.InterfaceType {
    if (!location)
      throw new Error('Can not parse interface type without location');
    if (type.getProperties().length == 0)
      throw new Error('Empty interface means any and is not supported');
    const cppType = new syntax.InterfaceType(type.symbol.name, modifiers);
    cppType.properties = createMapFromArray(type.getProperties(), (p) => {
      const type = this.parseSymbolType(p, location, [ 'property', ...modifiers ]);
      return [ p.name, type ];
    });
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
      return syntax.Type.createBooleanType(modifiers);
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
   * Return a proper type representation for Node.js objects.
   */
  parseNodeJsType(type: ts.Type, location?: ts.Node): syntax.Type | undefined {
    let result: syntax.Type | undefined;
    const name = type.symbol.name;
    if (type.isClassOrInterface()) {
      // Global objects.
      if (name == 'Process')
        result = new syntax.Type('Process', 'class');
      else if (name == 'Console')
        result = new syntax.Type('Console', 'class');
    } else if (isFunction(type)) {
      // The gc function.
      if (location?.getText() == 'gc')
        result = new syntax.FunctionType('function', syntax.Type.createVoidType(), []);
    }
    if (result) {
      result.namespace = 'compilets::nodejs';
      result.isExternal = true;
    }
    return result;
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
    const roots = this.getRootDeclarations(decl);
    if (hasQuestionToken(decl) ||
        (roots?.some(hasQuestionToken) && !hasTypeNode(decl))) {
      modifiers.push('optional');
    }
    // External type if declaration in in a d.ts file.
    if (roots?.some(isExternalDeclaration)) {
      modifiers.push('external');
    }
    return modifiers;
  }

  /**
   * Get the nodes that determines the type of the passed node.
   *
   * The result could be things like ts.TypeNode, literals, expressions, etc.
   */
  private getTypeNodes(decl: ts.Declaration): (ts.Declaration | ts.TypeNode | ts.Expression)[] {
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isParameter(decl)) {
      const {type, initializer} = decl as ts.VariableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration;
      if (type) {
        return [ type ];
      } else if (initializer) {
        const decls = this.getOriginalDeclarations(initializer);
        if (!decls)
          return [ initializer ];
        return decls.map(d => this.getTypeNodes(d))
                    .reduce((r, i) => r.concat(i), []);
      } else {
        throw new Error('Can not find type or initializer in the declaration');
      }
    }
    return [ decl ];
  }

  /**
   * Get the root declarations that decides the type of the passed declaration.
   *
   * For example, for `let a = object.prop`, this method returns the declaration
   * of `prop: type`.
   */
  private getRootDeclarations(decl?: ts.Declaration): ts.Declaration[] | undefined {
    if (!decl)
      return;
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isParameter(decl)) {
      const {type, initializer} = decl as ts.VariableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration;
      if (!type && initializer) {
        const decls = this.getOriginalDeclarations(initializer);
        if (decls) {
          return decls.map(d => this.getRootDeclarations(d) ?? [])
                      .reduce((r, i) => r.concat(i), []);
        }
      }
    }
    return [ decl ];
  }

  /**
   * Get the original declarations of a node.
   *
   * This is the declaration where the node's symbol is declared. Usually there
   * is only one declaration for most nodes, exceptions could be external APIs
   * of Node.js, or property of unions.
   */
  private getOriginalDeclarations(node: ts.Node): ts.Declaration[] | undefined {
    const symbol = this.typeChecker.getSymbolAtLocation(node);
    if (!symbol || !symbol.declarations || symbol.declarations.length == 0)
      return;
    return symbol.declarations;
  }

  /**
   * Like getTypeArguments but works for signature.
   *
   * We are abusing internals of TypeScript before there is an official API:
   * https://github.com/microsoft/TypeScript/issues/59637
   */
  private getTypeArgumentsOfSignature(signature: ts.Signature): readonly ts.Type[] {
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
   * Return whether the symbol of the node is a class declaration.
   */
  private isSymbolClass(node: ts.Node): boolean {
    if (node.kind == ts.SyntaxKind.ThisKeyword ||
        node.kind == ts.SyntaxKind.SuperKeyword)
      return false;
    const symbol = this.typeChecker.getSymbolAtLocation(node);
    if (!symbol || !symbol.valueDeclaration)
      return false;
    return ts.isClassDeclaration(symbol.valueDeclaration);
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
