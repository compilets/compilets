import * as syntax from './cpp-syntax';

class Paragraph {
  statements: syntax.Statement[] = [];
};

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export class CppFile {
  name: string;
  type: 'header' | 'source';
  paragraphs: Paragraph[];

  constructor(name: string) {
    this.name = name;
    this.type = name.endsWith('.h') ? 'header' : 'source';
    this.paragraphs = [ new Paragraph() ];
  }

  addStatement(statement: syntax.Statement) {
    this.paragraphs[this.paragraphs.length - 1].statements.push(statement);
  }

  print(): string {
    let text = '';
    for (const p of this.paragraphs) {
      for (const s of p.statements)
        text += s.print({}) + '\n';
    }
    return text;
  }
};
