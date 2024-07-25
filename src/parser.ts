import path from 'node:path';
import * as ts from 'typescript';

import {CppFile} from './cpp-file';
import * as syntax from './cpp-syntax';

export class UnimplementedError extends Error {
  constructor(node: ts.Node, message: string) {
    super(`${message}: ${node.getText()}`);
  }
}

export class Parser {
  program: ts.Program;
  typeChecker: ts.TypeChecker;

  constructor(program: ts.Program) {
    this.program = program;
    this.typeChecker = program.getTypeChecker();
  }

  parse(sourceFile: ts.SourceFile) {
    const cppFile = new CppFile(path.basename(sourceFile.fileName).replace(/.ts$/, '.cpp'));
    ts.forEachChild(sourceFile, (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.Block:
        case ts.SyntaxKind.VariableStatement:
        case ts.SyntaxKind.ExpressionStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.ForStatement:
          cppFile.addStatement(this.parseStatement(node as ts.Statement));
          return;
        case ts.SyntaxKind.ClassDeclaration:
          cppFile.addStatement(this.parseClassDeclaration(node as ts.ClassDeclaration));
          return;
        case ts.SyntaxKind.EmptyStatement:
        case ts.SyntaxKind.EndOfFileToken:
          return;
      }
      throw new UnimplementedError(node, 'Unsupported node');
    });
    return cppFile;
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
      case ts.SyntaxKind.ForInStatement:
        throw new UnimplementedError(node, 'The for...in loop is not supported');
      case ts.SyntaxKind.ForOfStatement:
        throw new UnimplementedError(node, 'The for...of loop is not supported');
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
        const type = this.parseType(node.name);
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
                                           this.parseType(name),
                                           initializer ? this.parseExpression(initializer) : undefined);
  }

  parseClassDeclaration(node: ts.ClassDeclaration): syntax.ClassDeclaration {
    if (!node.name)
      throw new UnimplementedError(node, 'Empty class name is not supported');
    if (node.typeParameters)
      throw new UnimplementedError(node, 'Generic class is not supported');
    if (node.heritageClauses)
      throw new UnimplementedError(node, 'Class inheritance is not supported');
    const members = node.members.map(this.parseClassElement.bind(this, node));
    return new syntax.ClassDeclaration(node.name.text, members);
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
        const {modifiers, name, initializer, questionToken} = node as ts.PropertyDeclaration;
        if (name.kind != ts.SyntaxKind.Identifier)
          throw new UnimplementedError(name, 'Only identifier can be used as property name');
        if (questionToken)
          throw new UnimplementedError(name, 'Question token in property is not supported');
        return new syntax.PropertyDeclaration((name as ts.Identifier).text,
                                              modifiers?.map(modifierToString) ?? [],
                                              this.parseType(name),
                                              initializer ? this.parseExpression(initializer) : undefined);
      }
    }
    throw new UnimplementedError(node, 'Unsupported class element');
  }

  parseExpression(node: ts.Expression): syntax.Expression {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
        return new syntax.RawExpression(node.getText());
      case ts.SyntaxKind.StringLiteral:
        return new syntax.StringLiteral((node as ts.StringLiteral).text);
      case ts.SyntaxKind.ParenthesizedExpression: {
        const {expression} = node as ts.ParenthesizedExpression;
        return new syntax.ParenthesizedExpression(this.parseExpression(expression));
      }
      case ts.SyntaxKind.PostfixUnaryExpression: {
        const {operand, operator} = node as ts.PostfixUnaryExpression;
        return new syntax.PostfixUnaryExpression(this.parseExpression(operand),
                                                 getOperator(operator));
      }
      case ts.SyntaxKind.PrefixUnaryExpression: {
        const {operand, operator} = node as ts.PrefixUnaryExpression;
        return new syntax.PrefixUnaryExpression(this.parseExpression(operand),
                                                getOperator(operator));
      }
      case ts.SyntaxKind.ConditionalExpression: {
        const {condition, whenTrue, whenFalse} = node as ts.ConditionalExpression;
        return new syntax.ConditionalExpression(this.parseExpression(condition),
                                                this.parseExpression(whenTrue),
                                                this.parseExpression(whenFalse));
      }
      case ts.SyntaxKind.BinaryExpression: {
        const {left, right, operatorToken} = node as ts.BinaryExpression;
        return new syntax.BinaryExpression(this.parseExpression(left),
                                           this.parseExpression(right),
                                           operatorToken.getText());
      }
    }
    throw new UnimplementedError(node, 'Unsupported expression');
  }

  parseType(node: ts.Node) {
    const type = this.typeChecker.getTypeAtLocation(node);
    const name = this.typeChecker.typeToString(type);
    if (name == 'boolean')
      return new syntax.Type('bool', 'primitive');
    if (name == 'number')
      return new syntax.Type('double', 'primitive');
    if (name == 'string')
      return new syntax.Type('string', 'string');
    throw new UnimplementedError(node, 'Unsupported type');
  }
}

// Convert JS operator to C++.
function getOperator(operator: ts.SyntaxKind) {
  switch (operator) {
    case ts.SyntaxKind.EqualsToken:
      return '=';
    case ts.SyntaxKind.TildeToken:
      return '~';
    case ts.SyntaxKind.PlusToken:
      return '+';
    case ts.SyntaxKind.PlusPlusToken:
      return '++';
    case ts.SyntaxKind.MinusToken:
      return '-';
    case ts.SyntaxKind.MinusMinusToken:
      return '--';
  }
  throw Error(`Unsupported operator: ${operator}`);
}

// Convert JS modifiers to C++.
function modifierToString(modifier: ts.ModifierLike): string {
  switch (modifier.kind) {
    case ts.SyntaxKind.PrivateKeyword:
      return 'private';
    case ts.SyntaxKind.ProtectedKeyword:
      return 'protected';
    case ts.SyntaxKind.PublicKeyword:
      return 'public';
  }
  throw new Error(`Unsupported modifier: ${modifier}`);
}
