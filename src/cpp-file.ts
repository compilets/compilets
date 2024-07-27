import * as syntax from './cpp-syntax';

interface PrintOptions {
  generationMode: syntax.GenerationMode;
}

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export default class CppFile {
  isMain: boolean;
  declarations = new syntax.Paragraph();
  body = new syntax.MainFunction();

  constructor(isMain = false) {
    this.isMain = isMain;
  }

  /**
   * Add a top-level declaration.
   */
  addDeclaration(declaration: syntax.DeclarationStatement) {
    this.declarations.statements.push(declaration);
  }

  /**
   * Add statements to the main body.
   */
  addStatement(statement: syntax.Statement) {
    this.body.addStatement(statement);
  }

  /**
   * Return whether top-level declarations can be added to this file.
   */
  canAddDeclaration() {
    return !this.isMain || this.body.isEmpty();
  }

  print(options: PrintOptions): string {
    const ctx = new syntax.PrintContext(options.generationMode, 'impl', 2);
    // Put declarations at first.
    let result = this.declarations.print(ctx);
    // Add empty line between declarations and main.
    if (this.declarations.statements.length > 0 && !this.body.isEmpty())
      result += '\n';
    // Print main function if:
    // 1) we are generating the exe main file;
    // 2) or there are statements in body.
    if ((options.generationMode == 'exe' && this.isMain) || !this.body.isEmpty())
      result += this.body.print(ctx);
    // Make sure file has a new line in the end.
    if (result.endsWith('\n'))
      return result;
    else
      return result + '\n';
  }
}
