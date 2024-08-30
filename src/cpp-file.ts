import * as syntax from './cpp-syntax';

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
  body = new syntax.MainFunction();

  constructor(fileName: string, type: CppFileType, interfaceRegistry: syntax.InterfaceRegistry) {
    this.name = fileName.replace(/\.ts$/, '');
    this.type = type;
    this.interfaceRegistry = interfaceRegistry;
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
    if (this.type == 'lib')
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
    if (this.type != 'lib')
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
    return this.type == 'lib' || this.body.isEmpty();
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
    // Set the namespace for the PrintContext.
    using scope = new syntax.PrintContextScope(ctx, {
      namespace: this.namespace,
      namespaceAliases: new Map(this.imports.filter(i => i.alias)
                                    .map(i => [ i.namespace, i.alias! ])),
    });
    // Print declarations and main function first.
    blocks.push(...this.printDeclarations(ctx));
    blocks.push(...this.printMainFunction(ctx));
    // Then interfaces.
    blocks.unshift(...this.printInterfaces(ctx));
    // Then forward declarations.
    blocks.unshift(...this.printForwardDeclarations(ctx));
    // Then forward declarations of interfaces.
    {
      using scope = new syntax.PrintContextScope(ctx, {mode: 'forward'});
      blocks.unshift(...this.printInterfaces(ctx));
    }
    // Then headers.
    blocks.unshift(...this.printImportHeaders(ctx));
    blocks.unshift(...this.printRuntimeHeaders(ctx));
    // Concatenate results.
    return printBlocks(mergeBlocks(blocks)) + '\n';
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
    return declarations.statements.map(s => {
      const code = s.print(ctx);
      const namespace = getDeclarationNamespace(this.namespace, s);
      return {code, namespace};
    });
  }

  /**
   * Print main function.
   */
  private printMainFunction(ctx: syntax.PrintContext): NamespaceBlock[] {
    // It is only printed when:
    // 1) we are generating the exe main file;
    // 2) or there are statements in body.
    if (this.type != 'lib' || !this.body.isEmpty())
      return [ {code: this.body.print(ctx), namespace: '|global'} ];
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
    using scope = new syntax.PrintContextScope(ctx, {namespace: 'compilets::generated'});
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
    // Print the collected interfaces.
    const isForwardDeclaration = ctx.mode == 'forward';
    return declarations.map((code) => {
      return {code, namespace: ctx.namespace, isForwardDeclaration};
    });
  }

  /**
   * Print forward declarations for all the function and class declarations.
   */
  private printForwardDeclarations(ctx: syntax.PrintContext): NamespaceBlock[] {
    let {statements} = this.declarations;
    // Only function/class need forward declaration.
    statements = statements.filter(d => d instanceof syntax.ClassDeclaration ||
                                        d instanceof syntax.FunctionDeclaration);
    // If only one declaration, then there is no need for forward declaration.
    if (statements.length <= 1)
      return [];
    // Put classes before functions.
    statements.sort((a, b) => {
      if (a instanceof syntax.ClassDeclaration && b instanceof syntax.FunctionDeclaration)
        return -1;
      if (a instanceof syntax.FunctionDeclaration && b instanceof syntax.ClassDeclaration)
        return 1;
      return 0;
    });
    if (ctx.mode == 'header') {
      // In header only print exported forward declarations.
      statements = statements.filter(s => s.isExported);
    } else if (ctx.mode == 'impl') {
      // In impl only print for non-exported.
      statements = statements.filter(s => !s.isExported);
    }
    if (statements.length == 0)
      return [];
    // Forward declarations are printed compact.
    using scope = new syntax.PrintContextScope(ctx, {mode: 'forward'});
    return statements.map(s => {
      const code = s.print(ctx);
      const namespace = getDeclarationNamespace(this.namespace, s);
      return {code, namespace, isForwardDeclaration: true};
    });
  }

  /**
   * Print headers introduced by imports.
   */
  private printImportHeaders(ctx: syntax.PrintContext): NamespaceBlock[] {
    if (this.imports.length == 0)
      return [];
    // Include the headers of imported files.
    const headers = this.imports.map(i => <IncludeDirective>{
      type: 'quoted',
      path: i.fileName.replace(/\.ts$/, '.h'),
    });
    // For namespace imports, create namespace aliases.
    const aliases = this.imports.filter(i => i.alias)
                                .map(i => `namespace ${i.alias} = ${i.namespace};`)
                                .join('\n');
    return [
      printIncludes(headers),
      {code: aliases, namespace: '|global'},
    ];
  }

  /**
   * Print required runtime headers for this file.
   */
  private printRuntimeHeaders(ctx: syntax.PrintContext): NamespaceBlock[] {
    // If this is the main file of an exe, it requires runtime headers.
    if (this.type == 'exe')
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
  const code = includes.map(i => i.type == 'bracket' ? `#include <${i.path}>`
                                                     : `#include "${i.path}"`)
                       .sort()
                       .join('\n');
  return {code, namespace: '|global'};
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
