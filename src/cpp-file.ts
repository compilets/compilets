import * as syntax from './cpp-syntax';

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export default class CppFile {
  body = new syntax.Paragraph();

  addStatement(statement: syntax.Statement) {
    this.body.statements.push(statement);
  }

  print(): string {
    const ctx = new syntax.PrintContext(2);
    const result = this.body.print(ctx);
    if (result.endsWith('\n'))
      return result;
    else
      return result + '\n';
  }
}
