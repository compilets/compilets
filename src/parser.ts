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
          this.parseVariableDeclaration(cppFile, d);
        }
        break;
      case ts.SyntaxKind.EndOfFileToken:
        return;
      default:
        throw new Error('Not Implemented');
    }
  }

  parseVariableDeclaration(cppFile: CppFile, decl: ts.VariableDeclaration) {
    switch (decl.name.kind) {
      case ts.SyntaxKind.Identifier:
        // let a = xxx;
        const name = (decl.name as ts.Identifier).text;
        const cppType = this.getType(decl.name);
        let cppDecl: syntax.VariableDeclaration;
        if (decl.initializer) {
          // let a = 123;
          const cppInit = this.getInitializer(decl.initializer);
          cppDecl = new syntax.VariableDeclaration(name, cppType, cppInit);
        } else {
          // let a;
          cppDecl = new syntax.VariableDeclaration(name, cppType);
        }
        cppFile.addStatement(new syntax.VariableStatement(cppDecl));
        break;
      default:
        throw new Error('Binding in variable declaration is not implemented');
    }
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

  getInitializer(node: ts.Expression) {
    switch (node.kind) {
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.StringLiteral:
        return new syntax.NumericLiteral(node.getText());
      default:
        throw new Error(`Unsupported initializer: "${node.getText()}"`);
    }
  }
}
