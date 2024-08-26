import * as syntax from './cpp-syntax';
import {cloneMap} from './js-utils';

interface PrintOptions {
  generationMode: syntax.GenerationMode;
  mode: syntax.PrintMode;
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
    const ctx = new syntax.PrintContext(options.generationMode, options.mode, 2);
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
    // Put results in a namespace.
    ctx.namespace = 'compilets::generated';
    let result = 'namespace compilets::generated {\n\n';
    // As interfaces are being generated while printing, keep printing until
    // there is no more generated.
    const declarations: string[] = [];
    const printed = new Set<string>();
    while (ctx.interfaces.size > printed.size) {
      for (const name of ctx.interfaces.difference(printed)) {
        const type = this.interfaceRegistry.get(name);
        declarations.push(type.printDeclaration(ctx));
        printed.add(name);
      }
    }
    // Add forward declarations to result.
    result += Array.from(printed).map(name => `struct ${name};`).join('\n');
    // Add declarations to result.
    result += '\n\n';
    result += declarations.join('\n\n');
    // End of namespace.
    result += '\n\n}  // namespace compilets::generated'
    ctx.namespace = undefined;
    return result;
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
    let hasTypeTraitsHeader = false;
    let hasObjectHeader = false;
    const headers = new syntax.Headers();
    for (const feature of ctx.features) {
      switch (feature) {
        case 'array':
        case 'function':
        case 'process':
        case 'console':
          hasObjectHeader = true;
        case 'string':
        case 'union':
          hasTypeTraitsHeader = true;
        case 'runtime':
          headers.addLocalHeader(`runtime/${feature}.h`);
      }
    }
    if (!hasObjectHeader && ctx.features.has('object')) {
      hasTypeTraitsHeader = true;
      headers.addLocalHeader('runtime/object.h');
    }
    if (!hasTypeTraitsHeader && ctx.features.has('type-traits')) {
      headers.addLocalHeader('runtime/type_traits.h');
    }
    return headers.print(ctx);
  }
}
