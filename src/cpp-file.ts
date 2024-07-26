import * as syntax from './cpp-syntax';

interface PrintOptions {
  mode: syntax.GenerationMode;
}

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export default class CppFile {
  isMain: boolean;
  body = new syntax.Paragraph();

  constructor(isMain = false) {
    this.isMain = isMain;
  }

  addStatement(statement: syntax.Statement) {
    this.body.statements.push(statement);
  }

  print(options: PrintOptions): string {
    const addMainFunction = options.mode == 'exe' && this.isMain;
    const ctx = new syntax.PrintContext(2);
    let result: string;
    if (addMainFunction) {
      // Put body inside the main function if this is the entry file.
      const statement = new syntax.Block([
        this.body,
        new syntax.ReturnStatement(new syntax.RawExpression('0')),
      ]);
      result = `int main(int, const char*[]) ` + statement.print(ctx);
    } else {
      result = this.body.print(ctx);
    }
    // Make sure file has a new line in the end.
    if (result.endsWith('\n'))
      return result;
    else
      return result + '\n';
  }
}
