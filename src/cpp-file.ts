import * as syntax from './cpp-syntax';

interface PrintOptions {
  generationMode: syntax.GenerationMode;
}

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export default class CppFile {
  isMain: boolean;
  interfaceRegistry: syntax.InterfaceRegistry;
  declarations = new syntax.Paragraph<syntax.DeclarationStatement>();
  body = new syntax.MainFunction();

  constructor(isMain: boolean, interfaceRegistry: syntax.InterfaceRegistry) {
    this.isMain = isMain;
    this.interfaceRegistry = interfaceRegistry;
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
    // Print all parts.
    const ctx = new syntax.PrintContext(options.generationMode, 'impl', 2);
    const forwardDeclarations = this.printForwardDeclarations(ctx);
    const declarations = this.declarations.print(ctx);
    const mainFunction = this.printMainFunction(ctx);
    // Collect used interfaces after printing code.
    const interfaces = this.printInterfaces(ctx);
    // Collect used headers after printing everything.
    const headers = this.printHeaders(ctx);
    // Concatenate parts together.
    let result = '';
    if (headers)
      result += headers + '\n';
    if (forwardDeclarations)
      result += forwardDeclarations + '\n\n';
    if (interfaces)
      result += interfaces;
    if (interfaces && declarations)
      result += '\n\n';
    if (declarations)
      result += declarations;
    if ((declarations || interfaces) && mainFunction)
      result += '\n';
    if (mainFunction)
      result += mainFunction;
    // Make sure file has a new line in the end.
    if (!result.endsWith('\n'))
      result += '\n';
    return result;
  }

  /**
   * Print forward declarations for all the function and class declarations.
   */
  private printForwardDeclarations(ctx: syntax.PrintContext): string | undefined {
    if (this.declarations.statements.length > 1) {
      const forward = new syntax.PrintContext(ctx.generationMode, 'forward', 2);
      return this.declarations.print(forward);
    }
  }

  /**
   * Print main function.
   */
  private printMainFunction(ctx: syntax.PrintContext): string | undefined {
    // It is only printed when:
    // 1) we are generating the exe main file;
    // 2) or there are statements in body.
    if ((ctx.generationMode == 'exe' && this.isMain) ||
        !this.body.isEmpty()) {
      return this.body.print(ctx);
    }
  }

  /**
   * Print used interfaces.
   */
  private printInterfaces(ctx: syntax.PrintContext): string | undefined {
    if (ctx.interfaces.size == 0)
      return;
    const interfaces: syntax.InterfaceType[] = [];
    for (const name of ctx.interfaces)
      interfaces.push(this.interfaceRegistry.get(name));
    return interfaces.map(i => i.printDeclaration(ctx)).join('\n\n');
  }

  /**
   * Print required headers for this file.
   */
  private printHeaders(ctx: syntax.PrintContext): string | undefined {
    // If this is the main file of an exe, it requires runtime headers.
    if (this.isMain && ctx.generationMode == 'exe')
      ctx.features.add('runtime');
    if (ctx.features.size == 0)
      return;
    // Add headers according to used features.
    const headers = new syntax.Headers();
    for (const feature of ctx.features) {
      switch (feature) {
        case 'string':
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
    return headers.print(ctx);
  }
}
