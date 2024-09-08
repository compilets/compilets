import * as ts from 'typescript';

import CppProject from './cpp-project';
import * as syntax from './cpp-syntax';

import {
  UnimplementedError,
  rethrowError,
  getNamespaceFromNode,
  hasTypeNode,
  hasQuestionToken,
  isExternalDeclaration,
  isBuiltinDeclaration,
  isModuleImports,
  isNodeJsType,
  isBuiltinInterfaceType,
  isGlobalVariable,
  isConstructor,
  FunctionLikeNode,
  isFunctionLikeNode,
  isFunction,
  isClass,
  isInterface,
  filterNode,
  parseHint,
  mergeTypes,
} from './parser-utils';
import {
  uniqueArray,
  createMapFromArray,
} from './js-utils';

/**
 * Utilities around the TypeChecker of typescript.
 */
export default class Typer {
  interfaceRegistry = new syntax.InterfaceRegistry();

  constructor(public project: CppProject,
              public typeChecker: ts.TypeChecker) {
  }

  /**
   * Parse the type of expression located at node to C++ type.
   */
  parseNodeType(node: ts.Node): syntax.Type {
    const decls = this.getOriginalDeclarations(node);
    // Rely on typeChecker for resolving type if:
    // 1) there is no declaration;
    // 2) builtin types are involved.
    if (!decls || decls.some(isBuiltinDeclaration))
      return this.parseTypeWithNode(this.typeChecker.getTypeAtLocation(node), node);
    // Parse the types of all declarations.
    let results: syntax.Type[] = [];
    for (const decl of decls) {
      // Get modifiers of the type from the declaration.
      const modifiers = this.getTypeModifiers(decl);
      // Compute the types of the declaration.
      let types = this.getTypeNodes(decl).map(node => this.typeChecker.getTypeAtLocation(node));
      // If there is unknown type parameter in the type, rely on typeChecker to
      // resolve the type instead, as our own type parser is not capable of
      // resolving type parameters yet.
      if (types.some(type => this.hasTypeParameter(type)))
        types = [ this.typeChecker.getTypeAtLocation(node) ];
      // Parse all the types.
      for (const type of types)
        results.push(this.parseTypeWithNode(type, node, modifiers));
    }
    // Some symbols have multiple declarations but our parser is not able to
    // distinguish the subtle differences.
    results = uniqueArray(results, (x, y) => x.equal(y));
    // When there are multiple types available, merge them to one. This can
    // happen when getting members from an union of objects.
    return mergeTypes(results);
  }

  /**
   * Parse the type of symbol at location.
   */
  parseSymbolType(symbol: ts.Symbol, location: ts.Node, modifiers?: syntax.TypeModifier[]) {
    try {
      const type = this.typeChecker.getTypeOfSymbolAtLocation(symbol, location);
      return this.parseType(type, location, modifiers);
    } catch (error) {
      rethrowError(location, error);
    }
  }

  /**
   * Wrap parseType with detailed error information.
   */
  parseTypeWithNode(type: ts.Type, node: ts.Node, modifiers?: syntax.TypeModifier[]): syntax.Type {
    try {
      return this.parseType(type, node, modifiers);
    } catch (error) {
      rethrowError(node, error);
    }
  }

  /**
   * Parse TypeScript type to C++ type.
   */
  parseType(type: ts.Type, location?: ts.Node, modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Check Node.js type.
    if (isNodeJsType(type)) {
      const result = this.parseNodeJsType(type, location);
      if (result)
        return result;
    }
    // Check literals.
    if (type.isNumberLiteral())
      return syntax.Type.createNumberType(modifiers);
    if (type.isStringLiteral())
      return syntax.Type.createStringType(modifiers);
    // Check union.
    const name = this.typeChecker.typeToString(type);
    if (type.isUnion())
      return this.parseUnionType(name, type as ts.UnionType, location, modifiers);
    // Check type parameter.
    const flags = type.getFlags();
    if (flags & ts.TypeFlags.TypeParameter)
      return new syntax.Type(name, 'template', modifiers);
    // Check builtin types.
    if (flags & (ts.TypeFlags.Never | ts.TypeFlags.Void))
      return syntax.Type.createVoidType(name, modifiers);
    if (flags & ts.TypeFlags.Null)
      return syntax.Type.createNullType(modifiers);
    if (flags & ts.TypeFlags.Undefined)
      return syntax.Type.createUndefinedType(modifiers);
    if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral))
      return syntax.Type.createBooleanType(modifiers);
    if (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral))
      return syntax.Type.createNumberType(modifiers);
    if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral))
      return syntax.Type.createStringType(modifiers);
    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))
      return new syntax.Type(name, 'any', modifiers);
    // Check array.
    if (this.typeChecker.isArrayType(type))
      return this.parseArrayType(name, type as ts.TypeReference, location, modifiers);
    // Check the namespace import and builtin interfaces like Math/Number.
    if (isModuleImports(type) || isBuiltinInterfaceType(type)) {
      const cppType = new syntax.Type(type.symbol.name, 'namespace');
      cppType.namespace = this.getTypeNamespace(type);
      return cppType;
    }
    // Check class.
    if (isClass(type) || isConstructor(type))
      return this.parseClassType(type, location, modifiers);
    // Check function.
    if (isFunction(type)) {
      if (!location)
        throw new Error('Functions can only be parsed knowing its location');
      const signature = type.getCallSignatures()[0];
      return this.parseSignatureType(signature, location, modifiers);
    }
    // Check interface.
    if (isInterface(type))
      return this.parseInterfaceType(type, location, modifiers);
    throw new Error(`Unsupported type "${name}"`);
  }

  /**
   * Parse the function type.
   */
  parseSignatureType(signature: ts.Signature,
                     location: ts.Node,
                     modifiers?: syntax.TypeModifier[]): syntax.FunctionType {
    // Tell whether this is a function or functor.
    let category: syntax.TypeCategory;
    let namespace: string | undefined;
    const {declaration} = signature;
    if (declaration) {
      namespace = this.getNodeNamespace(declaration);
      if (ts.isFunctionExpression(declaration) ||
          ts.isArrowFunction(declaration) ||
          ts.isFunctionTypeNode(declaration)) {
        category = 'functor';
      } else if (ts.isMethodDeclaration(declaration) ||
                 ts.isMethodSignature(declaration)) {
        category = 'method';
        // We need to know whether the method is static.
        if (!modifiers)
          modifiers = this.getTypeModifiers(declaration);
      } else {
        category = 'function';
      }
    } else {
      // Likely a function parameter.
      category = 'functor';
    }
    // Receive the C++ representations of returnType and parameters.
    const returnType = this.parseType(signature.getReturnType(), location);
    const parameters = this.parseSignatureParameters(signature.parameters, location);
    // Create the FunctionType.
    const cppType = new syntax.FunctionType(category, returnType, parameters, modifiers);
    // For function declarations use function name as type name.
    if (declaration && ts.isFunctionDeclaration(declaration) && declaration.name)
      cppType.name = declaration.name.text;
    cppType.namespace = namespace;
    if (signature.typeParameters)
      cppType.types = signature.typeParameters.map(p => this.parseType(p));
    cppType.templateArguments = this.getTypeArgumentsOfSignature(signature)?.map(p => this.parseType(p));
    return cppType;
  }

  /**
   * Parse the types of signature parameters at the location.
   */
  parseSignatureParameters(parameters: readonly ts.Symbol[], location: ts.Node): syntax.Type[] {
    return parameters.map((parameter) => {
      // Get the modifiers from the original declaration.
      const modifiers = this.getTypeModifiers(parameter.valueDeclaration);
      // Inference the type using the symbol and call site.
      return this.parseSymbolType(parameter, location, modifiers);
    });
  }

  /**
   * Parse the class type.
   */
  parseClassType(type: ts.GenericType,
                 location?: ts.Node,
                 modifiers?: syntax.TypeModifier[]): syntax.Type {
    const cppType = new syntax.Type(type.symbol.name, 'class', modifiers);
    cppType.namespace = this.getTypeNamespace(type);
    // Parse base classes.
    const base = type.getBaseTypes()?.find(isClass);
    if (base)
      cppType.base = this.parseType(base);
    // Parse type parameters and arguments.
    if (type.typeParameters)
      cppType.types = type.typeParameters.map(p => this.parseType(p, location));
    cppType.templateArguments = type.typeArguments?.map(a => this.parseType(a, location));
    return cppType;
  }

  /**
   * Parse the interface type.
   */
  parseInterfaceType(type: ts.InterfaceType,
                     location?: ts.Node,
                     modifiers: syntax.TypeModifier[] = []): syntax.InterfaceType {
    if (!location)
      throw new Error('Can not parse interface type without location');
    if (type.getProperties().length == 0)
      throw new Error('Empty interface means any and is not supported');
    const cppType = new syntax.InterfaceType(type.symbol.name, modifiers);
    cppType.properties = createMapFromArray(type.getProperties(), (p) => {
      const type = this.parseSymbolType(p, location, [ 'property' ]);
      return [ p.name, type ];
    });
    return this.interfaceRegistry.register(cppType);
  }

  /**
   * Parse the union type.
   */
  parseUnionType(name: string,
                 union: ts.UnionType,
                 location?: ts.Node,
                 modifiers?: syntax.TypeModifier[]): syntax.Type {
    // Literal unions are treated as a single type.
    if (union.types.every(t => t.isNumberLiteral()))
      return syntax.Type.createNumberType(modifiers);
    if (union.types.every(t => t.isStringLiteral()))
      return syntax.Type.createStringType(modifiers);
    if (union.types.every(t => t.getFlags() & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)))
      return syntax.Type.createBooleanType(modifiers);
    // Iterate all subtypes and add unique ones to cppType.
    let hasUndefined = false;
    let cppType = new syntax.Type(name, 'union', modifiers);
    for (const t of union.types) {
      const subtype = this.parseType(t, location, modifiers?.filter(m => m == 'property' || m == 'element'));
      if (subtype.category == 'undefined')
        hasUndefined = true;
      if (!cppType.types.find(s => s.equal(subtype)))
        cppType.types.push(subtype);
    }
    if (hasUndefined) {
      // Treat as optional type if type is something like "number | undefined".
      if (cppType.types.length == 2)
        cppType = cppType.types.find(t => t.category != 'undefined')!;
      cppType.isOptional = true;
    }
    // Make sure optional union type does not have undefined in the subtypes.
    if (cppType.category == 'union' && cppType.isOptional)
      cppType.types = cppType.types.filter(t => t.category != 'undefined');
    return cppType;
  }

  /**
   * Parse array type.
   */
  parseArrayType(name: string,
                 type: ts.TypeReference,
                 location?: ts.Node,
                 modifiers: syntax.TypeModifier[] = []): syntax.Type {
    const args = this.typeChecker.getTypeArguments(type);
    const cppType = new syntax.Type(name, 'array', modifiers);
    cppType.types = args.map(t => this.parseType(t, location, ['element', ...modifiers]));
    return cppType;
  }

  /**
   * Return a proper type representation for Node.js objects.
   */
  parseNodeJsType(type: ts.Type, location?: ts.Node): syntax.Type | undefined {
    let result: syntax.Type | undefined;
    const name = type.symbol.name;
    if (type.isClassOrInterface()) {
      // Global objects.
      if (name == 'Process')
        result = new syntax.Type('Process', 'class');
      else if (name == 'Console')
        result = new syntax.Type('Console', 'class');
    } else if (isFunction(type)) {
      // The gc function.
      if (location?.getText() == 'gc')
        result = new syntax.FunctionType('function', syntax.Type.createVoidType(), []);
    }
    if (result) {
      result.namespace = 'compilets::nodejs';
      result.isExternal = true;
    }
    return result;
  }

  /**
   * Get the namespace for the node.
   */
  getNodeNamespace(node: ts.Node): string | undefined {
    // Find out the declaration of the node, for example for the "process"
    // variable it should be "@node/types/process.d.ts".
    const decls = this.getNodeDeclarations(node);
    return this.getNamespaceFromDeclarations(decls ?? [ node ]);
  }

  /**
   * Throws error if the function uses closure.
   */
  forbidClosure(node: FunctionLikeNode) {
    const captured = this.getCapturedIdentifiers(node);
    if (captured.length > 0) {
      const capturedNames = [...new Set(captured.map(i => `"${i.getText()}"`))].join(', ');
      throw new UnimplementedError(node, `Function declaration can not include reference to outer state: ${capturedNames}`);
    }
  }

  /**
   * Return the names and types of outer variables referenced by the function.
   */
  getCapturedIdentifiers(func: FunctionLikeNode) {
    const closure: (ts.Identifier | ts.ThisExpression)[] = [];
    // Consider "this" as part of closure unless it is a method.
    let isVariable: (node: ts.Node) => boolean;
    if (ts.isConstructorDeclaration(func) ||
        ts.isMethodDeclaration(func) ||
        ts.isGetAccessor(func) ||
        ts.isSetAccessor(func)) {
      isVariable = ts.isIdentifier;
    } else {
      isVariable = (node: ts.Node) => ts.isIdentifier(node) || node.kind == ts.SyntaxKind.ThisKeyword;
    }
    // Iterate through all child nodes of function body.
    for (const node of filterNode(func.body, isVariable)) {
      // Keep references to "this".
      if (node.kind == ts.SyntaxKind.ThisKeyword) {
        closure.push(node as ts.ThisExpression);
        continue;
      }
      // Skip property names.
      if (node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.name == node)
        continue;
      // Ignore symbols without definition.
      const symbol = this.typeChecker.getSymbolAtLocation(node);
      if (!symbol)
        throw new UnimplementedError(node, `Identifier "${node.getText()}" has no symbol`);
      const {valueDeclaration} = symbol;
      if (!valueDeclaration)
        continue;
      // References to globals and properties are fine.
      if (valueDeclaration.getSourceFile().isDeclarationFile ||
          ts.isClassDeclaration(valueDeclaration) ||
          ts.isFunctionDeclaration(valueDeclaration) ||
          ts.isPropertyDeclaration(valueDeclaration) ||
          ts.isMethodDeclaration(valueDeclaration) ||
          ts.isLiteralTypeNode(valueDeclaration)) {
        continue;
      }
      // Find identifiers not declared inside the function.
      if (!ts.findAncestor(valueDeclaration, (n) => n == func)) {
        if (!isGlobalVariable(valueDeclaration!))
          closure.push(node as ts.Identifier);
      }
    }
    return uniqueArray(closure, (x, y) => x.getText() == y.getText());
  }

  /**
   * Get the type modifiers from the declaration.
   */
  private getTypeModifiers(decl?: ts.Declaration): syntax.TypeModifier[] {
    const modifiers: syntax.TypeModifier[] = [];
    if (!decl)
      return modifiers;
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isPropertySignature(decl) ||
        ts.isParameter(decl)) {
      // Convert function to functor when the node is a variable.
      modifiers.push('not-function');
    }
    if (ts.isPropertyDeclaration(decl) ||
        ts.isPropertySignature(decl)) {
      modifiers.push('property');
    }
    if (ts.isPropertyDeclaration(decl) ||
        ts.isPropertySignature(decl) ||
        ts.isMethodDeclaration(decl) ||
        ts.isMethodSignature(decl)) {
      if (this.isStaticProperty(decl))
        modifiers.push('static');
    }
    if (ts.isParameter(decl) && decl.dotDotDotToken) {
      modifiers.push('variadic');
    }
    // For variable declaration, the comments are in the declarationList.
    const hintNode = ts.isVariableDeclaration(decl) ? decl.parent : decl;
    // Parse the hints in comments.
    for (const hint of parseHint(hintNode)) {
      if (hint == 'persistent')
        modifiers.push('persistent');
    }
    // The type is optional in 2 cases:
    // 1. The original decl has a question token.
    // 2. The original declaration has no type specified, and the root one
    //    has a question token.
    const roots = this.getRootDeclarations(decl);
    if (hasQuestionToken(decl) ||
        (roots?.some(hasQuestionToken) && !hasTypeNode(decl))) {
      modifiers.push('optional');
    }
    // External type if declaration in in a d.ts file.
    if (roots?.some(isExternalDeclaration)) {
      modifiers.push('external');
    }
    return modifiers;
  }

  /**
   * Get the nodes that determines the type of the passed node.
   *
   * The result could be things like ts.TypeNode, literals, expressions, etc.
   */
  private getTypeNodes(decl: ts.Declaration): (ts.Declaration | ts.TypeNode | ts.Expression)[] {
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isParameter(decl)) {
      const {type, initializer} = decl as ts.VariableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration;
      if (type) {
        return [ type ];
      } else if (initializer) {
        const decls = this.getOriginalDeclarations(initializer);
        if (!decls)
          return [ initializer ];
        return decls.map(d => this.getTypeNodes(d))
                    .reduce((r, i) => r.concat(i), []);
      } else {
        throw new Error('Can not find type or initializer in the declaration');
      }
    }
    return [ decl ];
  }

  /**
   * Get the namespace for the type.
   */
  private getTypeNamespace(type: ts.Type): string | undefined {
    if (!type.symbol || !type.symbol.declarations)
      return;
    return this.getNamespaceFromDeclarations(type.symbol.declarations);
  }

  /**
   * Get the namespace from the declarations.
   */
  private getNamespaceFromDeclarations(decls: ts.Node[]): string | undefined {
    // When there are multiple declarations, make sure the ones from DOM are
    // ignored, which happens a lot for "console".
    let node: ts.Node | undefined;
    if (decls.length == 1)
      node = decls[0];
    else if (decls.length > 1)
      node = decls.find(d => !d.getSourceFile().fileName.endsWith('typescript/lib/lib.dom.d.ts'));
    if (!node)
      return;
    // If the node comes from the only file in the project, it does not have
    // a namespace.
    if (this.project.fileNames.length == 1 && !node.getSourceFile().isDeclarationFile)
      return;
    return getNamespaceFromNode(this.project.sourceRootDir, node);
  }

  /**
   * Get the root declarations that decides the type of the passed declaration.
   *
   * For example, for `let a = object.prop`, this method returns the declaration
   * of `prop: type`.
   */
  private getRootDeclarations(decl?: ts.Declaration): ts.Declaration[] | undefined {
    if (!decl)
      return;
    if (ts.isVariableDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isParameter(decl)) {
      const {type, initializer} = decl as ts.VariableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration;
      if (!type && initializer) {
        const decls = this.getOriginalDeclarations(initializer);
        if (decls) {
          return decls.map(d => this.getRootDeclarations(d) ?? [])
                      .reduce((r, i) => r.concat(i), []);
        }
      }
    }
    return [ decl ];
  }

  /**
   * Get the declarations of a node.
   *
   * This is the declaration where the node's symbol is declared. Usually there
   * is only one declaration for most nodes, exceptions could be external APIs
   * of Node.js, or property of unions.
   */
  private getNodeDeclarations(node: ts.Node): ts.Declaration[] | undefined {
    const symbol = this.typeChecker.getSymbolAtLocation(node);
    if (!symbol || !symbol.declarations || symbol.declarations.length == 0)
      return;
    return symbol.declarations;
  }

  /**
   * Like getNodeDeclarations, but also digs across imports.
   */
  private getOriginalDeclarations(node: ts.Node): ts.Declaration[] | undefined {
    const declarations = this.getNodeDeclarations(node);
    // If the declaration comes from "import", try to find its declaration from
    // the imported file.
    if (declarations?.every(d => ts.isImportSpecifier(d))) {
      const type = this.typeChecker.getTypeAtLocation(node);
      if (!type.symbol.valueDeclaration || type.symbol.valueDeclaration === node)
        return;
      return [ type.symbol.valueDeclaration ];
    }
    return declarations;
  }

  /**
   * Like getTypeArguments but works for signature.
   *
   * We are abusing internals of TypeScript before there is an official API:
   * https://github.com/microsoft/TypeScript/issues/59637
   */
  private getTypeArgumentsOfSignature(signature: ts.Signature): readonly ts.Type[] {
    const {mapper, target} = signature as unknown as {
      mapper: unknown,
      target: {typeParameters: unknown},
    };
    return this.typeChecker.getTypeArguments({
      node: {kind: ts.SyntaxKind.TypeReference},
      target: {
        outerTypeParameters: target?.typeParameters ?? [],
        localTypeParameters: [],
      },
      mapper,
    } as unknown as ts.TypeReference);
  }

  /**
   * Whether the type or its subtypes has type parameters in it.
   */
  private hasTypeParameter(type: ts.Type): boolean {
    if (type.isUnion())
      return type.types.some(this.hasTypeParameter.bind(this));
    if (type.isTypeParameter())
      return true;
    if (this.typeChecker.isArrayType(type))
      return this.typeChecker.getTypeArguments(type).some(this.hasTypeParameter.bind(this));
    return false;
  }

  /**
   * Whether the declaration should be treated as static property/method.
   *
   * Some types are interfaces in TypeScript but we want to treate them
   * as classes in C++, and their properties should become static.
   */
  private isStaticProperty(decl: ts.PropertyDeclaration |
                                 ts.PropertySignature |
                                 ts.MethodDeclaration |
                                 ts.MethodSignature) : boolean {
    if (decl.modifiers?.some(m => m.kind == ts.SyntaxKind.StaticKeyword))
      return true;
    if (!decl.parent)
      return false;
    return isConstructor(this.typeChecker.getTypeAtLocation(decl.parent));
  }
}
