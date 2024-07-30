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
} from './parser-utils';

/**
 * Convert TypeScript AST to C++ source code.
 */
export default class Parser {
  rootDir: string;
  mainFileName: string;
  program: ts.Program;
  typeChecker: ts.TypeChecker;

  constructor(rootDir: string, mainFileName: string, program: ts.Program) {
    this.rootDir = rootDir;
    this.mainFileName = mainFileName;
    this.program = program;
    this.typeChecker = program.getTypeChecker();
  }

  parse(): CppProject {
    const project = new CppProject(path.basename(this.rootDir));
    for (const fileName of this.program.getRootFileNames()) {
      const name = path.relative(this.rootDir, fileName)
                       .replace(/.ts$/, '.cpp');
      const isMain = fileName == this.mainFileName;
      const sourceFile = this.program.getSourceFile(fileName)!;
      project.addFile(name, this.parseSourceFile(isMain, sourceFile));
    }
    return project;
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
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.ThisKeyword:
        return new syntax.RawExpression(node.getText());
      case ts.SyntaxKind.StringLiteral:
        return new syntax.StringLiteral((node as ts.StringLiteral).text);
      case ts.SyntaxKind.ParenthesizedExpression: {
        // (a + b) * (c + d)
        const {expression} = node as ts.ParenthesizedExpression;
        return new syntax.ParenthesizedExpression(this.parseExpression(expression));
      }
      case ts.SyntaxKind.PostfixUnaryExpression: {
        // a++
        const {operand, operator} = node as ts.PostfixUnaryExpression;
        return new syntax.PostfixUnaryExpression(this.parseExpression(operand),
                                                 operatorToString(operator));
      }
      case ts.SyntaxKind.PrefixUnaryExpression: {
        // ++a
        const {operand, operator} = node as ts.PrefixUnaryExpression;
        return new syntax.PrefixUnaryExpression(this.parseExpression(operand),
                                                operatorToString(operator));
      }
      case ts.SyntaxKind.ConditionalExpression: {
        // a ? b : c
        const {condition, whenTrue, whenFalse} = node as ts.ConditionalExpression;
        return new syntax.ConditionalExpression(this.parseExpression(condition),
                                                this.parseExpression(whenTrue),
                                                this.parseExpression(whenFalse));
      }
      case ts.SyntaxKind.BinaryExpression: {
        // a + b
        const {left, right, operatorToken} = node as ts.BinaryExpression;
        return new syntax.BinaryExpression(this.parseExpression(left),
                                           this.parseExpression(right),
                                           operatorToken.getText());
      }
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression: {
        // function() { xxx }
        const {body, parameters, modifiers, asteriskToken, exclamationToken, questionToken, typeParameters} = node as ts.FunctionExpression;
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
        return new syntax.FunctionExpression(this.parseFunctionReturnType(node),
                                             parameters.map(this.parseParameterDeclaration.bind(this)),
                                             cppBody);
      }
      case ts.SyntaxKind.CallExpression: {
        // func(xxx)
        const {expression, typeArguments, questionDotToken} = node as ts.CallExpression;
        if (typeArguments)
          throw new UnimplementedError(node, 'Generic call is not supported');
        if (questionDotToken)
          throw new UnimplementedError(node, 'The ?. operator is not supported');
        return new syntax.CallExpression(this.parseExpression(expression),
                                         (node as ts.CallExpression)['arguments']?.map(this.parseExpression.bind(this)) ?? []);
      }
      case ts.SyntaxKind.NewExpression: {
        // new Class(xxx)
        const {expression, typeArguments} = node as ts.NewExpression;
        if (typeArguments)
          throw new UnimplementedError(node, 'Generic new is not supported');
        if (!ts.isIdentifier(expression))
          throw new UnsupportedError(node, 'The new operator only accepts class name');
        return new syntax.NewExpression(this.parseVariableType(expression),
                                        (node as ts.NewExpression)['arguments']?.map(this.parseExpression.bind(this)) ?? []);
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        // obj.prop
        const {expression, name, questionDotToken} = node as ts.PropertyAccessExpression;
        if (questionDotToken)
          throw new UnimplementedError(node, 'The ?. operator is not supported');
        if (!ts.isIdentifier(name))
          throw new UnimplementedError(name, 'Only identifier can be used as member name');
        const objectType = this.parseVariableType(expression);
        if (!objectType.isClass())
          throw new UnimplementedError(name, 'Only support accessing properties of class');
        return new syntax.PropertyAccessExpression(this.parseExpression(expression),
                                                   objectType,
                                                   this.parseVariableType(name),
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
        return new syntax.ReturnStatement(expression ? this.parseExpression(expression) : undefined);
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
        const name = (node.name as ts.Identifier).text;
        const type = this.parseVariableType(node.name);
        if (node.initializer) {
          // let a = 123;
          const init = this.parseExpression(node.initializer);
          return new syntax.VariableDeclaration(name, type, init);
        } else {
          // let a;
          return new syntax.VariableDeclaration(name, type);
        }
    }
    throw new UnimplementedError(node, 'Unsupported variable declaration');
  }

  parseParameterDeclaration(node: ts.ParameterDeclaration): syntax.ParameterDeclaration {
    if (node.questionToken)
      throw new UnimplementedError(node, 'Question token in parameter is not supported');
    const {name, initializer} = node;
    if (name.kind != ts.SyntaxKind.Identifier)
      throw new UnimplementedError(node, 'Binding in parameter is not supported');
    return new syntax.ParameterDeclaration((name as ts.Identifier).text,
                                           this.parseVariableType(name),
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
                                          parameters.map(this.parseParameterDeclaration.bind(this)),
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
    const cl = new syntax.ClassDeclaration(this.parseVariableType(node), members);
    members.forEach(m => m.parent = cl);
    return cl;
  }

  parseClassElement(parent: ts.ClassDeclaration, node: ts.ClassElement): syntax.ClassElement {
    switch (node.kind) {
      case ts.SyntaxKind.Constructor: {
        // constructor(xxx) { yyy }
        const {body, parameters} = node as ts.ConstructorDeclaration;
        return new syntax.ConstructorDeclaration(parent.name!.text,
                                                 parameters.map(this.parseParameterDeclaration.bind(this)),
                                                 body ? this.parseStatement(body) as syntax.Block : undefined);
      }
      case ts.SyntaxKind.PropertyDeclaration: {
        // prop: type = xxx;
        const {modifiers, name, initializer} = node as ts.PropertyDeclaration;
        if (name.kind != ts.SyntaxKind.Identifier)
          throw new UnimplementedError(name, 'Only identifier can be used as property name');
        return new syntax.PropertyDeclaration((name as ts.Identifier).text,
                                              modifiers?.map(modifierToString) ?? [],
                                              this.parseVariableType(name),
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
        return new syntax.MethodDeclaration((name as ts.Identifier).text,
                                            modifiers?.map(modifierToString) ?? [],
                                            this.parseFunctionReturnType(node),
                                            parameters.map(this.parseParameterDeclaration.bind(this)),
                                            body ? this.parseStatement(body) as syntax.Block : undefined);
      }
      case ts.SyntaxKind.SemicolonClassElement:
        return new syntax.SemicolonClassElement();
    }
    throw new UnimplementedError(node, 'Unsupported class element');
  }

  parseVariableType(node: ts.Node) {
    const type = this.typeChecker.getTypeAtLocation(node);
    return this.parseType(node, type);
  }

  parseFunctionReturnType(node: ts.Node) {
    const type = this.typeChecker.getTypeAtLocation(node);
    const signature = type.getCallSignatures()[0];
    return this.parseType(node, signature.getReturnType());
  }

  parseType(node: ts.Node, type: ts.Type) {
    // Check if it is a function.
    if (type.getCallSignatures().length > 0)
      return this.parseSignatureType(node, type.getCallSignatures()[0]);
    // Check the type of the node.
    if (type.symbol?.valueDeclaration && ts.isClassDeclaration(type.symbol.valueDeclaration))
      return new syntax.Type(type.symbol.name, 'gced-class');
    // Check the symbol of the node.
    const symbol = this.typeChecker.getSymbolAtLocation(node);
    // Does it have question token in the type?
    let isOptional = false;
    if (symbol?.valueDeclaration && ts.isPropertyDeclaration(symbol?.valueDeclaration))
      isOptional = (symbol?.valueDeclaration as ts.PropertyDeclaration).questionToken !== undefined;
    // Check builtin types.
    const name = this.typeChecker.typeToString(type);
    if (name == 'void')
      return new syntax.Type('void', 'void');
    if (name == 'boolean')
      return new syntax.Type('bool', 'primitive', isOptional);
    if (name == 'number')
      return new syntax.Type('double', 'primitive', isOptional);
    if (name == 'string')
      return new syntax.Type('string', 'string', isOptional);
    throw new UnimplementedError(node, `Unsupported type "${name}"`);
  }

  parseSignatureType(node: ts.Node, signature: ts.Signature): syntax.Type {
    // Receive the C++ representations of returnType and parameters.
    const ctx = new syntax.PrintContext('lib', 'header');
    const returnType = this.parseType(node, signature.getReturnType()).print(ctx);
    const parameters = signature.parameters.map((param) => {
      const decl = this.parseParameterDeclaration(param.valueDeclaration as ts.ParameterDeclaration);
      return decl.print(ctx);
    });
    return new syntax.Type(`std::function<${returnType}(${parameters.join(', ')})>`, 'functor');
  }
}
