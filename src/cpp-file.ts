import * as syntax from './cpp-syntax';
import {joinArray, cloneMap} from './js-utils';

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
    const blocks: NamespaceBlock[] = [];
    // Print declarations and main function first.
    blocks.push(...this.printDeclarations(ctx));
    blocks.push(...this.printMainFunction(ctx));
    // Then interfaces.
    blocks.unshift(...this.printInterfaces(ctx));
    // Then forward declarations.
    blocks.unshift(...this.printForwardDeclarations(ctx));
    // Then headers.
    blocks.unshift(...this.printHeaders(ctx));
    // Concatenate results.
    return joinArray(
      // Merge blocks with same namespace.
      blocks.reduce((result, block, index, blocks) => {
        if (result.length == 0)
          return [ block ];
        const last = result[result.length - 1];
        if (last.namespace === block.namespace) {
          last.code += '\n\n' + block.code;
          if (last.isForwardDeclaration != block.isForwardDeclaration)
            last.isForwardDeclaration = false;
        } else {
          result.push(block);
        }
        return result;
      }, <NamespaceBlock[]>[]),
      // Blocks have empty line between them.
      () => '\n\n',
      // Add namespaces when printing block.
      (block) => {
        if (block.namespace) {
          if (block.isForwardDeclaration)
            return `namespace ${block.namespace} {\n${block.code}\n}`;
          else
            return `namespace ${block.namespace} {\n\n${block.code}\n\n}  // namespace ${block.namespace}`;
        } else {
          return block.code;
        }
      }) + '\n';
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
  private printDeclarations(ctx: syntax.PrintContext): NamespaceBlock[] {
    let declarations = this.declarations;
    if (ctx.mode == 'header') {
      // In header print exported declarations except for non-template function,
      // which is printed in forward declarations.
      declarations = declarations.filter(d => d.isExported && !(d instanceof syntax.FunctionDeclaration && !d.type.hasTemplate()));
    } else if (ctx.mode == 'impl') {
      // In impl print everything except for exported template class/function,
      // whose full definition is printed in header.
      declarations = declarations.filter(d => !(d.isExported && d.type.hasTemplate()));
    }
    if (declarations.statements.length == 0)
      return [];
    return [ {code: declarations.print(ctx)} ];
  }

  /**
   * Print main function.
   */
  private printMainFunction(ctx: syntax.PrintContext): NamespaceBlock[] {
    // It is only printed when:
    // 1) we are generating the exe main file;
    // 2) or there are statements in body.
    if ((ctx.generationMode == 'exe' && this.isMain) ||
        !this.body.isEmpty()) {
      return [ {code: this.body.print(ctx)} ];
    }
    return [];
  }

  /**
   * Print used interfaces.
   */
  private printInterfaces(ctx: syntax.PrintContext): NamespaceBlock[] {
    // Remove skipped interfaces.
    let interfaces = ctx.interfaces;
    if (ctx.includedInterfaces)
      interfaces = interfaces.difference(ctx.includedInterfaces);
    if (interfaces.size == 0)
      return [];
    ctx.namespace = 'compilets::generated';
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
    ctx.interfaces = printed;
    // Add forward declarations to results.
    const results: NamespaceBlock[] = [];
    if (printed.size > 1) {
      results.push({
        code: Array.from(printed).map(name => `struct ${name};`).join('\n'),
        namespace: 'compilets::generated',
        isForwardDeclaration: true,
      });
    }
    // Add declarations to results.
    results.push({
      code: declarations.join('\n\n'),
      namespace: 'compilets::generated',
    });
    // End of namespace.
    ctx.namespace = undefined;
    return results;
  }

  /**
   * Print forward declarations for all the function and class declarations.
   */
  private printForwardDeclarations(ctx: syntax.PrintContext): NamespaceBlock[] {
    // When it is a .cpp file with a .h header, the forward declarations only
    // live in header.
    if (ctx.mode == 'impl' && this.hasExports())
      return [];
    const statements = this.declarations.statements.filter(d => d instanceof syntax.ClassDeclaration ||
                                                                d instanceof syntax.FunctionDeclaration);
    if (statements.length <= 1)
      return [];
    const forward = new syntax.PrintContext(ctx.generationMode, 'forward', 2);
    return [ {code: statements.map(s => s.print(forward)).join('\n')} ];
  }

  /**
   * Print required headers for this file.
   */
  private printHeaders(ctx: syntax.PrintContext): NamespaceBlock[] {
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
      return [];
    const headers: IncludeDirective[] = [];
    if (includesOwnHeader)
      headers.push({type: 'quoted', path: `${this.name}.h`});
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
          headers.push({type: 'quoted', path: `runtime/${feature}.h`});
      }
    }
    let allFeatures = ctx.features;
    if (ctx.includedFeatures)
      allFeatures = allFeatures.union(ctx.includedFeatures);
    if (features.has('object') && !hasHeadersUsingObject(allFeatures))
      headers.push({type: 'quoted', path: 'runtime/object.h'});
    if (features.has('type-traits') && !hasHeadersUsingTypeTraits(allFeatures))
      headers.push({type: 'quoted', path: 'runtime/type_traits.h'});
    const code = headers.map(h => h.type == 'bracket' ? `#include <${h.path}>`
                                                      : `#include "${h.path}"`)
                        .sort()
                        .join('\n');
    return [ {code} ];
  }
}

// Code block wrapped by namespaces.
interface NamespaceBlock {
  code: string;
  namespace?: string;
  isForwardDeclaration?: boolean;
}

// Represent the #include directive in C++.
interface IncludeDirective {
  type: 'bracket' | 'quoted';
  path: string;
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
