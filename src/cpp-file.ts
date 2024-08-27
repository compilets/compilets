import * as syntax from './cpp-syntax';
import {cloneMap} from './js-utils';

/**
 * Represent a `.h` or `.cc` file in C++.
 */
export default class CppFile {
  name: string;
  isMain: boolean;
  interfaceRegistry: syntax.InterfaceRegistry;
  declarations = new syntax.Paragraph<syntax.DeclarationStatement>();
  variableStatements = new Array<syntax.VariableStatement>();
  body = new syntax.MainFunction();

  constructor(name: string, isMain: boolean, interfaceRegistry: syntax.InterfaceRegistry) {
    this.name = name;
    this.isMain = isMain;
    this.interfaceRegistry = interfaceRegistry;
  }

  /**
   * Add a top-level class/function declaration.
   */
  addDeclaration(declaration: syntax.DeclarationStatement) {
    // When seeing class/function declaration in main script, the variable
    // statements before should be treated as static variables.
    if (this.isMain)
      this.pushVariableStatementsToDeclarations();
    this.pushDeclaration(declaration);
  }

  /**
   * Add a top-level variable declaration.
   */
  addVariableStatement(statement: syntax.VariableStatement) {
    // For non-main function top-level variable declaration is static variable.
    if (!this.isMain)
      return this.addDeclaration(statement);
    // If the function has been created, treat it as local variable.
    if (!this.body.isEmpty())
      return this.addStatement(statement);
    // Otherwise keep the declarations and wait for following statements.
    this.variableStatements.push(statement);
  }

  /**
   * Add statements to the main body.
   */
  addStatement(statement: syntax.Statement) {
    // When adding a statement to main function, the variable statements before
    // should belong to the main function.
    if (this.isMain)
      this.pushVariableStatementsToMainFunction();
    this.body.addStatement(statement);
  }

  /**
   * Move the variable statements to main function.
   */
  pushVariableStatementsToMainFunction() {
    if (this.variableStatements.length == 0)
      return;
    this.body.addStatement(...this.variableStatements);
    this.variableStatements = [];
  }

  /**
   * Move the variable statements to declarations.
   */
  pushVariableStatementsToDeclarations() {
    if (this.variableStatements.length == 0)
      return;
    this.pushDeclaration(...this.variableStatements);
    this.variableStatements = [];
  }

  /**
   * Return whether top-level declarations can be added to this file.
   */
  canAddDeclaration(): boolean {
    return !this.isMain || this.body.isEmpty();
  }

  /**
   * Return whether this file contains exported declarations.
   */
  hasExports(): boolean {
    return this.declarations.statements.some(d => d.isExported);
  }

  /**
   * Print the file to C++ source code.
   */
  print(ctx: syntax.PrintContext): string {
    // Print all parts.
    const forwardDeclarations = this.printForwardDeclarations(ctx);
    const declarations = this.printDeclarations(ctx);
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
   * Push the declaration to this.declarations with some checks.
   */
  private pushDeclaration(...declarations: syntax.DeclarationStatement[]) {
    for (const decl of declarations) {
      if (decl instanceof syntax.VariableStatement) {
        if (decl.type.hasObject() && decl.declarationList.declarations.some(d => d.initializer))
          throw new Error('Can not initialize objects in top-level variable declarations');
      }
    }
    this.declarations.statements.push(...declarations);
  }

  /**
   * Print declarations for all the function and class declarations.
   */
  private printDeclarations(ctx: syntax.PrintContext): string | undefined {
    let declarations = this.declarations;
    if (ctx.mode == 'header')
      declarations = declarations.filter(d => d.isExported);
    else if (ctx.mode == 'impl')
      declarations = declarations.filter(d => !(d.isExported && d.type.hasTemplate()));
    if (declarations.statements.length == 0)
      return;
    return declarations.print(ctx);
  }

  /**
   * Print forward declarations for all the function and class declarations.
   */
  private printForwardDeclarations(ctx: syntax.PrintContext): string | undefined {
    // When it is a .cpp file with a .h header, the forward declarations only
    // live in header.
    if (ctx.mode == 'impl' && this.hasExports())
      return;
    const statements = this.declarations.statements.filter(d => d instanceof syntax.ClassDeclaration ||
                                                                d instanceof syntax.FunctionDeclaration);
    if (statements.length > 1) {
      const forward = new syntax.PrintContext(ctx.generationMode, 'forward', 2);
      return statements.map(s => s.print(forward)).join('\n');
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
    // Remove skipped interfaces.
    let interfaces = ctx.interfaces;
    if (ctx.includedInterfaces)
      interfaces = interfaces.difference(ctx.includedInterfaces);
    if (interfaces.size == 0)
      return;
    // Put results in a namespace.
    ctx.namespace = 'compilets::generated';
    let result = 'namespace compilets::generated {\n\n';
    // As interfaces are being generated while printing, keep printing until
    // there is no more generated.
    const declarations: string[] = [];
    const printed = new Set<string>();
    while (interfaces.size > printed.size) {
      for (const name of interfaces.difference(printed)) {
        const type = this.interfaceRegistry.get(name);
        declarations.push(type.printDeclaration(ctx));
        printed.add(name);
      }
      if (ctx.includedInterfaces)
        interfaces = ctx.interfaces.difference(ctx.includedInterfaces);
    }
    // Add forward declarations to result.
    if (printed.size > 1) {
      result += Array.from(printed).map(name => `struct ${name};`).join('\n');
      result += '\n\n';
    }
    // Add declarations to result.
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
    // Remove included headers.
    let features = ctx.features;
    if (ctx.includedFeatures)
      features = features.difference(ctx.includedFeatures);
    // The .cpp file with exports needs to to include its own header.
    const includesOwnHeader = ctx.mode == 'impl' && this.hasExports();
    if (features.size == 0 && !includesOwnHeader)
      return;
    const headers = new syntax.Headers();
    if (includesOwnHeader)
      headers.addLocalHeader(`${this.name}.h`);
    // Add headers according to used features.
    for (const feature of features) {
      switch (feature) {
        case 'array':
        case 'function':
        case 'process':
        case 'console':
        case 'string':
        case 'union':
        case 'runtime':
          headers.addLocalHeader(`runtime/${feature}.h`);
      }
    }
    let allFeatures = ctx.features;
    if (ctx.includedFeatures)
      allFeatures = allFeatures.union(ctx.includedFeatures);
    if (features.has('object') && !hasHeadersUsingObject(allFeatures))
      headers.addLocalHeader('runtime/object.h');
    if (features.has('type-traits') && !hasHeadersUsingTypeTraits(allFeatures))
      headers.addLocalHeader('runtime/type_traits.h');
    return headers.print(ctx);
  }
}

// Whether the features includes classes that inherits from object.
function hasHeadersUsingObject(features: Set<syntax.Feature>) {
  for (const feature of features) {
    switch (feature) {
      case 'array':
      case 'function':
      case 'process':
      case 'console':
        return true;
    }
  }
  return false;
}

// Whether the features use the type traits.
function hasHeadersUsingTypeTraits(features: Set<syntax.Feature>) {
  for (const feature of features) {
    switch (feature) {
      case 'array':
      case 'function':
      case 'process':
      case 'console':
      case 'object':
      case 'string':
      case 'union':
        return true;
    }
  }
  return false;
}
