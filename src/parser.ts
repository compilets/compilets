import path from 'node:path';
import * as ts from 'typescript';

import {CppFile} from './cpp-file';
import * as syntax from './cpp-syntax';

export class Parser {
  program: ts.Program;
  typeChecker: ts.TypeChecker;

  constructor(program: ts.Program) {
    this.program = program;
    this.typeChecker = program.getTypeChecker();
  }

  parse(sourceFile: ts.SourceFile) {
    const cppFile = new CppFile(path.basename(sourceFile.fileName).replace(/.ts$/, '.cpp'));
    ts.forEachChild(sourceFile, this.parseNode.bind(this, cppFile));
    return cppFile;
  }

  parseNode(cppFile: CppFile, node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.VariableStatement:
        // let a = xxx, b = xxx;
        for (const d of (node as ts.VariableStatement).declarationList.declarations) {
          const decl = this.getVariableDeclaration(d);
          cppFile.addStatement(new syntax.VariableStatement(decl));
        }
        return;
      case ts.SyntaxKind.ExpressionStatement:
        // xxxx;
        const expr = this.getExpression((node as ts.ExpressionStatement).expression);
        cppFile.addStatement(new syntax.ExpressionStatement(expr));
        return;
      case ts.SyntaxKind.EndOfFileToken:
        return;
    }
    throw new Error(`Unsupported node: ${node.getText()}`);
  }

  getVariableDeclaration(node: ts.VariableDeclaration): syntax.VariableDeclaration {
    switch (node.name.kind) {
      case ts.SyntaxKind.Identifier:
        // let a = xxx;
        const name = (node.name as ts.Identifier).text;
        const type = this.getType(node.name);
        if (node.initializer) {
          // let a = 123;
          const init = this.getExpression(node.initializer);
          return new syntax.VariableDeclaration(name, type, init);
        } else {
          // let a;
          return new syntax.VariableDeclaration(name, type);
        }
    }
    throw new Error(`Binding in variable declaration not implemented: ${node.getText()}`);
  }

  getExpression(node: ts.Expression): syntax.Expression {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        return new syntax.Identifier(node.getText());
      case ts.SyntaxKind.NumericLiteral:
        return new syntax.NumericLiteral(node.getText());
      case ts.SyntaxKind.StringLiteral:
        return new syntax.StringLiteral(node.getText());
      case ts.SyntaxKind.PostfixUnaryExpression: {
        const {operand, operator} = node as ts.PostfixUnaryExpression;
        return new syntax.PostfixUnaryExpression(this.getExpression(operand),
                                                 getOperator(operator));
      }
      case ts.SyntaxKind.PrefixUnaryExpression: {
        const {operand, operator} = node as ts.PrefixUnaryExpression;
        return new syntax.PrefixUnaryExpression(this.getExpression(operand),
                                                getOperator(operator));
      }
      case ts.SyntaxKind.ConditionalExpression: {
        const {condition, whenTrue, whenFalse} = node as ts.ConditionalExpression;
        return new syntax.ConditionalExpression(this.getExpression(condition),
                                                this.getExpression(whenTrue),
                                                this.getExpression(whenFalse));
      }
      case ts.SyntaxKind.BinaryExpression: {
        const {left, right, operatorToken} = node as ts.BinaryExpression;
        return new syntax.BinaryExpression(this.getExpression(left),
                                           this.getExpression(right),
                                           operatorToken.getText());
      }
    }
    throw new Error(`Unsupported expression: ${node.getText()}`);
  }

  getType(node: ts.Node) {
    const type = this.typeChecker.getTypeAtLocation(node);
    const name = this.typeChecker.typeToString(type);
    if (name == 'boolean')
      return new syntax.Type('bool', 'primitive');
    if (name == 'number')
      return new syntax.Type('double', 'primitive');
    if (name == 'string')
      return new syntax.Type('string', 'string');
    throw new Error(`Unsupported type: "${name}"`);
  }
};

// Return whether the expression can be directly kept as it is in C++.
function isCppLiteral(node: ts.Expression) {
  return node.kind == ts.SyntaxKind.NumericLiteral ||
         node.kind == ts.SyntaxKind.StringLiteral ||
         node.kind == ts.SyntaxKind.Identifier;
};

// Convert JS operator to C++.
function getOperator(operator: ts.SyntaxKind) {
  switch (operator) {
    case ts.SyntaxKind.EqualsToken:
      return '=';
    case ts.SyntaxKind.PlusPlusToken:
      return '++';
    case ts.SyntaxKind.MinusMinusToken:
      return '--';
  }
  throw Error(`Unsupported operator: ${operator}`);
}
