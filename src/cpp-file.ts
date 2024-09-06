import * as syntax from './cpp-syntax';
import {uniqueArray} from './js-utils';

/**
 * Possible types of the CppFile.
 */
type CppFileType = 'lib' |  // file shared between all targets
                   'exe' |  // executable entry file
                   'napi';  // native module entry file

/**
 * Represent a .ts file in C++, should be translated to .h and .cpp files.
 */
export default class CppFile {
  name: string;
  type: CppFileType;
  interfaceRegistry: syntax.InterfaceRegistry;
  namespace?: string;
  imports = new Array<syntax.ImportDeclaration>();
  declarations = new syntax.Paragraph<syntax.DeclarationStatement>();
  variableStatements = new Array<syntax.VariableStatement>();
  body?: syntax.MainFunction;

  constructor(fileName: string, type: CppFileType, interfaceRegistry: syntax.InterfaceRegistry) {
    this.name = fileName.replace(/\.ts$/, '');
    this.type = type;
    this.interfaceRegistry = interfaceRegistry;
    if (type == 'exe')
      this.body = new syntax.MainFunctionExe();
    else if (type == 'napi')
      this.body = new syntax.MainFunctionNode();
  }

  /**
   * Add import declarations.
   */
  addImport(declaration: syntax.ImportDeclaration) {
    this.imports.push(declaration);
  }

  /**
   * Add a top-level class/function declaration.
   */
  addDeclaration(declaration: syntax.DeclarationStatement) {
    // When seeing class/function declaration in main script, the variable
    // statements before should be treated as static variables.
    if (this.type != 'lib')
      this.pushVariableStatementsToDeclarations();
    this.pushDeclaration(declaration);
  }

  /**
   * Add a top-level variable declaration.
   */
  addVariableStatement(statement: syntax.VariableStatement) {
    // For non-main function top-level variable declaration is static variable.
    if (!this.body)
      return this.addDeclaration(statement);
    // If the main function has been created, treat it as local variable.
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
    this.pushVariableStatementsToMainFunction();
    this.body!.addStatement(statement);
  }

  /**
   * Move the variable statements to main function.
   */
  pushVariableStatementsToMainFunction() {
    if (this.variableStatements.length == 0)
      return;
    this.body!.addStatement(...this.variableStatements);
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
    return !this.body || this.body.isEmpty();
  }

  /**
   * Return whether this file contains exported declarations.
   */
  hasExports(): boolean {
    if (this.type != 'lib')
      return false;
    return this.declarations.statements.some(d => d.isExported);
  }

  /**
   * Print the file to C++ source code.
   */
  print(ctx: syntax.PrintContext): string {
    const blocks: NamespaceBlock[] = [];
    // Set the namespace for the PrintContext.
    using scope = new syntax.PrintContextScope(ctx, {
      namespace: this.namespace,
      ...getImportAliases(this.imports, this.namespace),
    });
    // Print declarations and main function first.
    const [ fullDeclarations, forwardDeclarations, usedInterfaces ] = this.printDeclarations(ctx);
    blocks.push(...fullDeclarations);
    blocks.push(...this.printMainFunction(ctx));
    // Then interfaces.
    const [ interfaceDeclarations, forwardInterfaceDeclarations ] = this.printInterfaces(ctx, usedInterfaces);
    blocks.unshift(...interfaceDeclarations);
    // Then forward declarations.
    blocks.unshift(...forwardDeclarations);
    blocks.unshift(...forwardInterfaceDeclarations);
    // Then headers.
    blocks.unshift(...this.printImportHeaders(ctx));
    blocks.unshift(...this.printRuntimeHeaders(ctx));
    // Concatenate results.
    const code = printBlocks(mergeBlocks(blocks));
    // Add header guard.
    if (ctx.mode == 'header' && ctx.namespace) {
      const guard = ctx.namespace.replace(/::/g, '_')
                                 .replace(/_ts$/, '_h')
                                 .toUpperCase() + '_';
      return `#ifndef ${guard}\n#define ${guard}\n\n${code}\n\n#endif  // ${guard}\n`;
    }
    // We prefer files ending with a new line.
    return code + '\n';
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
  private printDeclarations(ctx: syntax.PrintContext): [NamespaceBlock[], NamespaceBlock[], Set<string>] {
    let declarations = this.declarations;
    if (ctx.mode == 'header') {
      // In header print exported declarations.
      declarations = declarations.filter(d => d.isExported);
    } else if (ctx.mode == 'impl') {
      // In impl print everything except for exported template class/function,
      // whose full definition is printed in header.
      declarations = declarations.filter(d => !(d.isExported && d.type.hasTemplate()));
    }
    const fullDeclarations: NamespaceBlock[] = [];
    const forwardDeclarations: NamespaceBlock[] = [];
    let usedInterfaces = new Set<string>();
    // Iterate and print all declarations.
    const declaredTypes = new Set<string>();
    const forwardDeclaredTypes = new Set<string>();
    for (const statement of declarations.statements) {
      // Get the namespace string for NamespaceBlock.
      const namespace = getDeclarationNamespace(this.namespace, statement);
      // Print full declaration first.
      declaredTypes.add(`${statement.type.namespace ?? ''},${statement.type.name}`);
      fullDeclarations.push({code: statement.print(ctx), namespace});
      // Print its forward declaration if it was used before declaration.
      if (forwardDeclaredTypes.has(statement.type.name)) {
        using scope = new syntax.PrintContextScope(ctx, {mode: 'forward', interfaces: new Set<string>()});
        forwardDeclarations.push({code: statement.print(ctx), namespace, isForwardDeclaration: true});
        // Save the interfaces used when printing forward declaration.
        usedInterfaces = usedInterfaces.union(ctx.interfaces);
      }
      // Check the used but undeclared types.
      for (const value of ctx.usedTypes.difference(declaredTypes)) {
        // Save the undeclared types belong to this file.
        const [ namespace, name ] = value.split(',');
        if (namespace == (this.namespace ?? ''))
          forwardDeclaredTypes.add(name);
      }
    }
    return [ fullDeclarations, forwardDeclarations, usedInterfaces ];
  }

  /**
   * Print main function.
   */
  private printMainFunction(ctx: syntax.PrintContext): NamespaceBlock[] {
    // It is only printed when we are generating the exe/napi main file.
    if (this.body) {
      const namespace = '|global';
      const result = [ {code: this.body.print(ctx), namespace} ];
      // The code in main function share the same namespace scope with the file.
      if (this.namespace)
        result.unshift({code: `using namespace ${this.namespace};`, namespace});
      // For native module we need to use NAPI_MODULE macro.
      if (this.type == 'napi')
        result.push({code: 'NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)', namespace});
      return result;
    }
    return [];
  }

  /**
   * Print used interfaces.
   */
  private printInterfaces(ctx: syntax.PrintContext, forwardDeclaredInterfaces: Set<string>): [ NamespaceBlock[], NamespaceBlock[] ] {
    // Remove interfaces already included.
    let interfaces = ctx.interfaces;
    if (ctx.includedInterfaces)
      interfaces = interfaces.difference(ctx.includedInterfaces);
    if (interfaces.size == 0)
      return [ [], [] ];
    const fullDeclarations: NamespaceBlock[] = [];
    const forwardDeclarations: NamespaceBlock[] = [];
    // As interfaces are being generated while printing, keep printing until
    // there is no more generated.
    using scope = new syntax.PrintContextScope(ctx, {namespace: 'compilets::generated'});
    const declaredInterfaces = new Set<string>();
    while (interfaces.size > declaredInterfaces.size) {
      // Iterate through the newly generated interfaces.
      for (const name of interfaces.difference(declaredInterfaces)) {
        declaredInterfaces.add(name);
        // Enter a new scope to collect used interfaces when printing this interface.
        using scope = new syntax.PrintContextScope(ctx, {interfaces: new Set<string>()});
        // Print the full declaration first.
        const type = this.interfaceRegistry.get(name);
        fullDeclarations.push({
          code: type.printDeclaration(ctx),
          namespace: ctx.namespace,
        });
        // Print its forward declaration if it was used before declaration.
        if (forwardDeclaredInterfaces.has(name)) {
          using scope = new syntax.PrintContextScope(ctx, {mode: 'forward'});
          forwardDeclarations.push({
            code: type.printDeclaration(ctx),
            namespace: ctx.namespace,
            isForwardDeclaration: true,
          });
        }
        // Get used but undeclared interfaces.
        let usedInterfaces = ctx.interfaces.difference(declaredInterfaces);
        if (ctx.includedInterfaces)
          usedInterfaces = usedInterfaces.difference(ctx.includedInterfaces);
        // Add them to the collections.
        interfaces = interfaces.union(usedInterfaces);
        forwardDeclaredInterfaces = forwardDeclaredInterfaces.union(usedInterfaces);
      }
    }
    return [ fullDeclarations, forwardDeclarations ];
  }

  /**
   * Print headers introduced by imports.
   */
  private printImportHeaders(ctx: syntax.PrintContext): NamespaceBlock[] {
    if (this.imports.length == 0 || (ctx.mode == 'impl' && this.hasExports()))
      return [];
    // Include the headers of imported files.
    const headers = this.imports.map(i => <IncludeDirective>{
      type: 'quoted',
      path: i.fileName.replace(/\.ts$/, '.h'),
    });
    // Print the import directives.
    const directives = this.imports.map(i => i.print(ctx)).join('\n');
    return [
      printIncludes(headers),
      {code: directives, namespace: ctx.namespace},
    ];
  }

  /**
   * Print required runtime headers for this file.
   */
  private printRuntimeHeaders(ctx: syntax.PrintContext): NamespaceBlock[] {
    // If this is the main file of an exe, it requires runtime headers.
    if (this.type != 'lib')
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
        case 'math':
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
    return [ printIncludes(headers) ];
  }
}

// Code block wrapped by namespaces.
interface NamespaceBlock {
  code: string;
  namespace?: '|anonymous' | '|global' | string;
  isForwardDeclaration?: boolean;
  before?: NamespaceBlock[];
  after?: NamespaceBlock[];
}

// Merge blocks with same namespace.
function mergeBlocks(blocks: NamespaceBlock[]): NamespaceBlock[] {
  const addBlock = (arr: NamespaceBlock[], block: NamespaceBlock) => {
    if (arr.length == 0) {
      arr.push(block);
      return;
    }
    // If two blocks have the same namespace, merge to one.
    const last = arr[arr.length - 1];
    if (last.namespace === block.namespace) {
      const separator = last.isForwardDeclaration && block.isForwardDeclaration ? '\n' : '\n\n';
      last.code += separator + block.code;
      if (last.isForwardDeclaration != block.isForwardDeclaration)
        last.isForwardDeclaration = false;
      return;
    }
    if (last.namespace && block.namespace) {
      // If new block's namespace is a child of previous one, merge it to its
      // child blocks.
      if (block.namespace.startsWith(last.namespace)) {
        if (!last.after)
          last.after = [];
        block.namespace = block.namespace.substr(last.namespace.length + 2);
        addBlock(last.after, block);
        return;
      }
      // If previous block's namespace is a child of new one, move previous one
      // to the new block's child blocks.
      if (last.namespace.startsWith(block.namespace)) {
        arr.splice(arr.length - 1, 1);
        block.before = [];
        last.namespace = last.namespace.substr(block.namespace.length + 2);
        addBlock(block.before, last);
      }
    }
    arr.push(block);
  };
  const result: NamespaceBlock[] = [];
  for (const block of blocks)
    addBlock(result, block);
  return result;
}

// Print the blocks.
function printBlocks(blocks: NamespaceBlock[]) {
  const print = (block: NamespaceBlock) => {
    let result = '';
    // Add namespace prefix.
    if (block.namespace && block.namespace != '|global') {
      if (block.namespace == '|anonymous')
        result += 'namespace {\n';
      else
        result += `namespace ${block.namespace} {\n`;
      if (!block.isForwardDeclaration)
        result += '\n';
    }
    // Print code.
    const text = [ block.code ];
    if (block.before)
      text.unshift(printBlocks(block.before));
    if (block.after)
      text.push(printBlocks(block.after));
    result += text.join('\n\n');
    // Add namespace suffix.
    if (block.namespace && block.namespace != '|global') {
      if (block.isForwardDeclaration) {
        result += '\n}';
      } else {
        result += '\n';
        if (block.namespace == '|anonymous')
          result += '\n}  // namespace';
        else
          result += `\n}  // namespace ${block.namespace}`;
      }
    }
    return result;
  };
  return blocks.map(print).join('\n\n');
}

// Represent the #include directive in C++.
interface IncludeDirective {
  type: 'bracket' | 'quoted';
  path: string;
}

// Print the headers.
function printIncludes(includes: IncludeDirective[]): NamespaceBlock {
  includes = uniqueArray(includes, (a, b) => a.type == b.type && a.path == b.path);
  const code = includes.map(i => i.type == 'bracket' ? `#include <${i.path}>`
                                                     : `#include "${i.path}"`)
                       .sort()
                       .join('\n');
  return {code, namespace: '|global'};
}

// Return the alias settings from imports.
function getImportAliases(imports: syntax.ImportDeclaration[], currentNamespace?: string): Partial<syntax.PrintContext> {
  const current = currentNamespace ? `${currentNamespace}::` : '';
  const namespaceAliases = new Map<string, string>();
  const typeAliases = new Map<string, string>();
  for (const i of imports) {
    if (i.namespaceAlias) {
      namespaceAliases.set(i.namespace, current + i.namespaceAlias);
    }
    if (i.names) {
      for (const name of i.names)
        typeAliases.set(`${i.namespace}::${name}`, current + name);
    }
    if (i.aliases) {
      for (const [ name, alias ] of i.aliases)
        typeAliases.set(`${i.namespace}::${name}`, current + alias);
    }
  }
  return {namespaceAliases, typeAliases};
}

// Return the namespace according to the declaration's isExported state.
function getDeclarationNamespace(namespace: string | undefined, decl: syntax.DeclarationStatement): string | undefined {
  if (decl.isExported)
    return namespace;
  if (namespace)
    return namespace + '::' + '|anonymous';
  else
    return '|anonymous';
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
