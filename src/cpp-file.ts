import * as syntax from './cpp-syntax';

interface PrintOptions {
  generationMode: syntax.GenerationMode;
}

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export default class CppFile {
  isMain: boolean;
  declarations = new syntax.Paragraph<syntax.DeclarationStatement>();
  body = new syntax.MainFunction();

  constructor(isMain: boolean) {
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
    this.body.body.statements.push(statement);
  }

  /**
   * Return whether top-level declarations can be added to this file.
   */
  canAddDeclaration() {
    return !this.isMain || this.body.isEmpty();
  }

  /**
   * Print the file to C++ source code.
   */
  print(options: PrintOptions): string {
    const ctx = new syntax.PrintContext(options.generationMode, 'impl', 2);
    // Print forward declarations.
    let result = '';
    if (this.declarations.statements.length > 1) {
      result += this.declarations.print(new syntax.PrintContext(options.generationMode, 'forward', 2));
      if (this.declarations.statements.length > 0)
        result += '\n\n';
    }
    // Then declarations.
    result += this.declarations.print(ctx);
    // Add empty line between declarations and main.
    if (this.declarations.statements.length > 0 && !this.body.isEmpty())
      result += '\n';
    // Print main function if:
    // 1) we are generating the exe main file;
    // 2) or there are statements in body.
    if ((options.generationMode == 'exe' && this.isMain) || !this.body.isEmpty())
      result += this.body.print(ctx);
    // After printing the body, print headers and put it at first.
    result = this.getHeaders(ctx).print(ctx) + result;
    // Make sure file has a new line in the end.
    if (result.endsWith('\n'))
      return result;
    else
      return result + '\n';
  }

  /**
   * Get required headers for this file.
   */
  private getHeaders(ctx: syntax.PrintContext): syntax.Headers {
    let features = ctx.features;
    // If this is the main file of an exe, it requires runtime headers.
    if (this.isMain && ctx.generationMode == 'exe')
      features = features.union(new Set([ 'runtime' ]));
    // Add headers according to used features.
    const headers = new syntax.Headers();
    for (const feature of features) {
      switch (feature) {
        case 'optional':
          headers.stl.push(new syntax.IncludeStatement('angle-bracket', feature));
          break;
        case 'union':
        case 'array':
        case 'function':
        case 'object':
        case 'runtime':
        case 'process':
        case 'console':
          headers.files.push(new syntax.IncludeStatement('quoted', `runtime/${feature}.h`));
          break;
      }
    }
    return headers;
  }
}
