import * as syntax from './cpp-syntax';

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export class CppFile {
  name: string;
  type: 'header' | 'source';
  body = new syntax.Paragraph();

  constructor(name: string) {
    this.name = name;
    this.type = name.endsWith('.h') ? 'header' : 'source';
  }

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
