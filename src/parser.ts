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
  hasQuestionToken,
  hasTypeNode,
  getFunctionClosure,
  parseHint,
  parseNodeJsType,
} from './parser-utils';

/**
 * Convert TypeScript AST to C++ source code.
 */
export default class Parser {
  project: CppProject;
  program: ts.Program;
  typeChecker: ts.TypeChecker;

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
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.ThisKeyword:
        return new syntax.RawExpression(this.parseNodeType(node),
                                        node.getText());
      case ts.SyntaxKind.NullKeyword:
        return new syntax.RawExpression(this.parseNodeType(node),
                                        'nullptr');
      case ts.SyntaxKind.StringLiteral:
        return new syntax.StringLiteral(this.parseNodeType(node),
                                        (node as ts.StringLiteral).text);
      case ts.SyntaxKind.Identifier: {
        const type = this.parseNodeType(node);
        return new syntax.Identifier(type,
                                     type.category == 'null' ? 'nullptr'
                                                             : node.getText());
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
        const {left, right, operatorToken} = node as ts.BinaryExpression;
        return new syntax.BinaryExpression(this.parseNodeType(node),
                                           this.parseExpression(left),
                                           this.parseExpression(right),
                                           operatorToken.getText());
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
        const funcNode = node as ts.ArrowFunction | ts.FunctionExpression;
        const {body, parameters, modifiers, asteriskToken, exclamationToken, questionToken, typeParameters} = funcNode;
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
        const closure = getFunctionClosure(this.typeChecker, funcNode).filter(n => this.parseNodeType(n).hasObject())
                                                                      .map(n => n.getText());
        return new syntax.FunctionExpression(this.parseNodeType(node),
                                             this.parseFunctionReturnType(node),
                                             parameters.map(this.parseParameterDeclaration.bind(this)),
                                             closure,
                                             cppBody);
      }
      case ts.SyntaxKind.CallExpression: {
        // func(xxx)
        const callExpression = node as ts.CallExpression;
        const {expression, typeArguments, questionDotToken} = callExpression;
        const args = callExpression['arguments'];  // arguments is a keyword
        if (typeArguments)
          throw new UnimplementedError(node, 'Generic call is not supported');
        if (questionDotToken)
          throw new UnimplementedError(node, 'The ?. operator is not supported');
        return new syntax.CallExpression(this.parseNodeType(node),
                                         this.parseExpression(expression),
                                         this.parseArguments(callExpression, args));
      }
      case ts.SyntaxKind.NewExpression: {
        // new Class(xxx)
        const newExpression = node as ts.NewExpression;
        const {expression, typeArguments} = newExpression;
        const args = newExpression['arguments'];  // arguments is a keyword
        if (typeArguments)
          throw new UnimplementedError(node, 'Generic new is not supported');
        if (!ts.isIdentifier(expression))
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
        if (obj.type.category != 'class')
          throw new UnimplementedError(name, 'Only support accessing properties of class');
        return new syntax.PropertyAccessExpression(this.parseNodeType(node),
                                                   obj,
                                                   (name as ts.Identifier).text);
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
          const func = ts.findAncestor(node.parent, n => ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n));
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
        if (node.initializer) {
          // let a = 123;
          return new syntax.VariableDeclaration(name.text,
                                                cppType,
                                                this.parseExpression(node.initializer));
        } else {
          // let a;
          return new syntax.VariableDeclaration(name.text, cppType);
        }
    }
    throw new UnimplementedError(node, 'Unsupported variable declaration');
  }

  parseParameters(parameters: ts.NodeArray<ts.ParameterDeclaration> | ts.ParameterDeclaration[]): syntax.ParameterDeclaration[] {
    return parameters.map(this.parseParameterDeclaration.bind(this));
  }

  parseParameterDeclaration(node: ts.ParameterDeclaration): syntax.ParameterDeclaration {
    const {name, dotDotDotToken, initializer} = node;
    if (name.kind != ts.SyntaxKind.Identifier)
      throw new UnimplementedError(node, 'Binding in parameter is not supported');
    return new syntax.ParameterDeclaration((name as ts.Identifier).text,
                                           this.parseNodeType(name),
                                           dotDotDotToken != undefined,
                                           initializer ? this.parseExpression(initializer) : undefined);
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
    if (node.typeParameters)
      throw new UnimplementedError(node, 'Generic function is not supported');
    if (node.modifiers?.find(m => m.kind == ts.SyntaxKind.AsyncKeyword))
      throw new UnimplementedError(node, 'Async function is not supported');
    if (!ts.isSourceFile(node.parent))
      throw new UnimplementedError(node, 'Local function is not supported');
    const {body, name, parameters} = node;
    return new syntax.FunctionDeclaration(name.text,
                                          this.parseFunctionReturnType(node),
                                          this.parseParameters(parameters),
                                          body ? this.parseStatement(body) as syntax.Block : undefined);
  }

  parseClassDeclaration(node: ts.ClassDeclaration): syntax.ClassDeclaration {
    if (!node.name)
      throw new UnimplementedError(node, 'Empty class name is not supported');
    if (node.typeParameters)
      throw new UnimplementedError(node, 'Generic class is not supported');
    if (node.heritageClauses)
      throw new UnimplementedError(node, 'Class inheritance is not supported');
    const members = node.members.map(this.parseClassElement.bind(this, node));
    const cl = new syntax.ClassDeclaration(this.parseNodeType(node), members);
    members.forEach(m => m.parent = cl);
    return cl;
  }

  parseClassElement(parent: ts.ClassDeclaration, node: ts.ClassElement): syntax.ClassElement {
    switch (node.kind) {
      case ts.SyntaxKind.Constructor: {
        // constructor(xxx) { yyy }
        const {body, parameters} = node as ts.ConstructorDeclaration;
        return new syntax.ConstructorDeclaration(parent.name!.text,
                                                 this.parseParameters(parameters),
                                                 body ? this.parseStatement(body) as syntax.Block : undefined);
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
        const cppModifiers = modifiers?.map(modifierToString) ?? [];
        cppModifiers.push(...parseHint(node));
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

  parseArguments(node: ts.CallLikeExpression, args?: ts.NodeArray<ts.Expression>) {
    if (!args)
      return new syntax.CallArguments([], []);
    const resolvedSignature = this.typeChecker.getResolvedSignature(node);
    if (!resolvedSignature)
      throw new UnimplementedError(node, 'Can not get resolved signature');
    const parameters = resolvedSignature.parameters.map(p => p.valueDeclaration as ts.ParameterDeclaration);
    return new syntax.CallArguments(args.map(this.parseExpression.bind(this)),
                                    this.parseParameters(parameters));
  }

  /**
   * Parse the type of expression located at node to C++ type.
   */
  parseNodeType(node: ts.Node): syntax.Type {
    const modifiers: syntax.TypeModifier[] = [];
    // Get the original declaration of the node.
    const decl = this.getOriginalDeclaration(node);
    // Get property information from original declaration.
    if (decl) {
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
    // Get the node the represents the type of node, and query its type.
    const typeNode = decl ? this.getTypeNode(decl) : node;
    const type = this.typeChecker.getTypeAtLocation(typeNode);
    // Whether the declaration in in a d.ts file.
    if (root?.getSourceFile().isDeclarationFile)
      modifiers.push('external');
    // Check Node.js type.
    if (modifiers.includes('external')) {
      const nodeJsType = parseNodeJsType(node, type);
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
      return this.parseType(type, modifiers);
    } catch (error: unknown) {
      if (error instanceof Error)
        throw new UnimplementedError(node, error.message);
      else
        throw error;
    }
  }

  /**
   * Parse TypeScript type to C++ type.
   */
  parseType(type: ts.Type, modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Check literals.
    if (type.isNumberLiteral())
      return new syntax.Type('double', 'primitive', modifiers);
    if (type.isStringLiteral())
      return new syntax.Type('string', 'string', modifiers);
    // Check function.
    if (type.getCallSignatures().length > 0)
      return this.parseFunctionType(type, modifiers);
    // Check class.
    if (type.isClass())
      return new syntax.Type(type.symbol.name, 'class', modifiers);
    // Check union.
    const name = this.typeChecker.typeToString(type);
    if (type.isUnion())
      return this.parseUnionType(name, type as ts.UnionType, modifiers);
    // Check builtin types.
    const flags = type.getFlags();
    if (flags & (ts.TypeFlags.Never | ts.TypeFlags.Void))
        return new syntax.Type(name, 'void', modifiers);
    if (flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
      return new syntax.Type(name, 'null', modifiers);
    if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral))
      return new syntax.Type('bool', 'primitive', modifiers);
    if (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral))
      return new syntax.Type('double', 'primitive', modifiers);
    if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral))
      return new syntax.Type('string', 'string', modifiers);
    // Check array.
    if (this.typeChecker.isArrayType(type))
      return this.parseArrayType(name, type, modifiers);
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
  parseFunctionType(type: ts.Type, modifiers?: syntax.TypeModifier[]): syntax.Type {
    const signature = type.getCallSignatures()[0];
    // Receive the C++ representations of returnType and parameters.
    const ctx = new syntax.PrintContext('lib', 'header');
    const returnType = this.parseType(signature.getReturnType()).print(ctx);
    const parameters = signature.parameters.map(p => this.parseParameterDeclaration(p.valueDeclaration as ts.ParameterDeclaration))
                                           .map(p => p.type.print(ctx))
                                           .join(', ')
    // Tell whether this is a function or functor.
    let category: syntax.TypeCategory;
    const {valueDeclaration} = type.symbol;
    if (valueDeclaration) {
      if (ts.isFunctionExpression(valueDeclaration) ||
          ts.isArrowFunction(valueDeclaration) ||
          ts.isVariableDeclaration(valueDeclaration)) {
        category = 'functor';
      } else {
        category = 'function';
      }
    } else {
      // Likely a function parameter.
      category = 'functor';
    }
    return new syntax.Type(`${returnType}(${parameters})`, category, modifiers);
  }

  /**
   * Parse the union type.
   */
  parseUnionType(name: string,
                 union: ts.UnionType,
                 modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Literal unions are treated as a single type.
    if (union.types.every(t => t.isNumberLiteral()))
      return new syntax.Type('double', 'primitive', modifiers);
    if (union.types.every(t => t.isStringLiteral()))
      return new syntax.Type('string', 'string', modifiers);
    if (union.types.every(t => t.getFlags() & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)))
      return new syntax.Type('bool', 'primitive', modifiers);
    // Iterate all subtypes and add unique ones to cppType.
    let hasNull = false;
    let hasUndefined = false;
    let cppType = new syntax.Type(name, 'union', modifiers);
    for (const t of union.types) {
      const subtype = this.parseType(t, modifiers?.filter(m => m == 'property'));
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
  parseArrayType(name: string, type: ts.Type, modifiers: syntax.TypeModifier[] = []): syntax.Type {
    const args = this.typeChecker.getTypeArguments(type as ts.TypeReference);
    const cppType = new syntax.Type(name, 'array', modifiers);
    cppType.types = args.map(t => this.parseType(t, ['element', ...modifiers]));
    return cppType;
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
      }
    }
    return decl;
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
}
