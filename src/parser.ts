import path from 'node:path';
import * as ts from 'typescript';

import {CppFile} from './cpp-file';
import * as syntax from './cpp-syntax';

export class UnimplementedError extends Error {
  constructor(message: string) {
    super(message);
  }
};

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
        case ts.SyntaxKind.VariableStatement:
        case ts.SyntaxKind.ExpressionStatement:
          this.parseStatement(node as ts.Statement).forEach(cppFile.addStatement.bind(cppFile));
          return;
        case ts.SyntaxKind.EndOfFileToken:
          return;
      }
      throw new UnimplementedError(`Unsupported node: ${node.getText()}`);
    });
    return cppFile;
  }

  parseStatement(node: ts.Statement): syntax.Statement[] {
    switch (node.kind) {
      case ts.SyntaxKind.VariableStatement:
        // let a = xxx, b = xxx;
        const statements: syntax.Statement[] = [];
        for (const d of (node as ts.VariableStatement).declarationList.declarations) {
          const decl = this.parseVariableDeclaration(d);
          statements.push(new syntax.VariableStatement(decl));
        }
        return statements;
      case ts.SyntaxKind.ExpressionStatement:
        // xxxx;
        const expr = this.parseExpression((node as ts.ExpressionStatement).expression);
        return [ new syntax.ExpressionStatement(expr) ];
    }
    throw new UnimplementedError(`Unsupported statement: ${node.getText()}`);
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
    throw new UnimplementedError(`Unsupported variable declaration: ${node.getText()}`);
  }

  parseExpression(node: ts.Expression): syntax.Expression {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
        return new syntax.RawExpression(node.getText());
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
    throw new UnimplementedError(`Unsupported expression: ${node.getText()}`);
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
    throw new UnimplementedError(`Unsupported type: "${name}"`);
  }
};

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
