import * as ts from 'typescript';
import * as syntax from './cpp-syntax';
import {uniqueArray} from './js-utils';

/**
 * An error indicating a TypeScript feature has not been implemented.
 */
export class UnimplementedError extends Error {
  constructor(node: ts.Node, message: string) {
    super(`${message}: ${node.getText()}`);
  }
}

/**
 * An error indicating a TypeScript feature not supported in C++.
 */
export class UnsupportedError extends Error {
  constructor(node: ts.Node, message: string) {
    super(`${message}: ${node.getText()}`);
  }
}

/**
 * Rethrow the error as a user-friendly one.
 */
export function rethrowError(location: ts.Node, error: unknown): never {
  if ((error instanceof UnimplementedError) ||
      (error instanceof UnsupportedError)) {
    throw error;
  } else if (error instanceof Error) {
    throw new UnimplementedError(location, error.message);
  } else {
    throw new UnimplementedError(location, String(error));
  }
}

/**
 * Convert JS operator to C++.
 */
export function operatorToString(operator: ts.SyntaxKind) {
  switch (operator) {
    case ts.SyntaxKind.EqualsToken:
      return '=';
    case ts.SyntaxKind.EqualsEqualsToken:
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return '==';
    case ts.SyntaxKind.ExclamationToken:
      return '!';
    case ts.SyntaxKind.TildeToken:
      return '~';
    case ts.SyntaxKind.PlusToken:
      return '+';
    case ts.SyntaxKind.PlusPlusToken:
      return '++';
    case ts.SyntaxKind.MinusToken:
      return '-';
    case ts.SyntaxKind.MinusMinusToken:
      return '--';
  }
  throw Error(`Unsupported operator: ${operator}`);
}

/**
 * Convert JS modifiers to C++.
 */
export function modifierToString(modifier: ts.ModifierLike): string {
  switch (modifier.kind) {
    case ts.SyntaxKind.OverrideKeyword:
      return 'override';
    case ts.SyntaxKind.PrivateKeyword:
      return 'private';
    case ts.SyntaxKind.ProtectedKeyword:
      return 'protected';
    case ts.SyntaxKind.PublicKeyword:
      return 'public';
    case ts.SyntaxKind.StaticKeyword:
      return 'static';
  }
  throw new Error(`Unsupported modifier: ${modifier.getText()}`);
}

/**
 * Return whether the declaration has a question token in it.
 */
export function hasQuestionToken(decl?: ts.Declaration): boolean {
  if (!decl)
    return false;
  if (ts.isPropertyDeclaration(decl) || ts.isParameter(decl)) {
    const {questionToken} = decl as ts.PropertyDeclaration | ts.ParameterDeclaration;
    return questionToken != undefined;
  }
  return false;
}

/**
 * Return whether the declaration has type specified in it.
 */
export function hasTypeNode(decl?: ts.Declaration): boolean {
  if (!decl)
    return false;
  if (ts.isVariableDeclaration(decl) ||
      ts.isPropertyDeclaration(decl) ||
      ts.isParameter(decl)) {
    const {type} = decl as ts.VariableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration;
    return type != undefined;
  }
  return false;
}

/**
 * Return whether the declaration is from a .d.ts file.
 */
export function isExternalDeclaration(decl: ts.Declaration): boolean {
  return decl.getSourceFile().isDeclarationFile;
}

/**
 * Return whether the declaration is marked as "export".
 */
export function isExportedDeclaration(decl: ts.ClassDeclaration | ts.FunctionDeclaration): boolean {
  if (!decl.modifiers)
    return false;
  return decl.modifiers.some(m => m.kind == ts.SyntaxKind.ExportKeyword);
}

/**
 * Return whether the declaration comes from Node.js.
 */
export function isNodeJsDeclaration(decl: ts.Declaration): boolean {
  const sourceFile = decl.getSourceFile();
  return sourceFile.isDeclarationFile &&
         sourceFile.fileName.includes('node_modules/@types/node');
}

/**
 * Return whether the type of node is from Node.js.
 */
export function isNodeJsType(type: ts.Type): boolean {
  if (!type.symbol || !type.symbol.declarations)
    return false;
  return type.symbol.declarations.some(isNodeJsDeclaration);
}

/**
 * Whether the node is a function type.
 */
export type FunctionLikeNode = ts.FunctionDeclaration |
                               ts.FunctionExpression |
                               ts.ArrowFunction |
                               ts.ConstructorDeclaration |
                               ts.MethodDeclaration;
export function isFunctionLikeNode(node: ts.Node): node is FunctionLikeNode {
  return ts.isFunctionDeclaration(node) ||
         ts.isFunctionExpression(node) ||
         ts.isArrowFunction(node) ||
         ts.isConstructorDeclaration(node) ||
         ts.isMethodDeclaration(node);
}

/**
 * Return whether the type is a function.
 */
export function isFunction(type: ts.Type): boolean {
  return type.getCallSignatures().length > 0;
}

/**
 * Return whether a parsed type is a template functor.
 */
export function isTemplateFunctor(type: syntax.Type): boolean {
  return type.category == 'functor' &&
         type.types.some(t => t.category == 'template');
}

/**
 * Return whether the type is a class or a generic class. The ts.isClass ignores
 * generic class.
 */
export function isClass(type: ts.Type): type is ts.GenericType {
  if (!(type.flags & ts.TypeFlags.Object))
    return false;
  return ((type as ts.ObjectType).objectFlags & (ts.ObjectFlags.Class | ts.ObjectFlags.Reference)) != 0;
}

/**
 * Return whether the type is a interface.
 *
 * Note that we treat object literals as interface too.
 */
export function isInterface(type: ts.Type): type is ts.InterfaceType {
  if (!(type.flags & ts.TypeFlags.Object))
    return false;
  return ((type as ts.ObjectType).objectFlags & (ts.ObjectFlags.Interface | ts.ObjectFlags.Anonymous)) != 0;
}

/**
 * Helper to get all the child nodes.
 */
export function filterNode(node?: ts.Node,
                           predicate?: (node: ts.Node) => boolean,
                           isLeaf: (node: ts.Node) => boolean = isFunctionLikeNode) {
  const results: ts.Node[] = [];
  if (!node)
    return results;
  const visit = (node: ts.Node) => {
    if (!predicate || predicate(node))
      results.push(node);
    if (!isLeaf(node))
      ts.forEachChild(node, visit);
  };
  visit(node);
  return results;
}

/**
 * Parse comment hints like "// compilets: destructor".
 */
export function parseHint(node: ts.Node): string[] {
  const fullText = node.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, 0);
  if (ranges && ranges.length > 0) {
    const range = ranges[ranges.length - 1];
    const comment = fullText.substring(range.pos, range.end);
    if (comment.startsWith('// compilets: '))
      return comment.substring(14).split(',');
  }
  return [];
}

/**
 * Merge multiple types into one union.
 */
export function mergeTypes(types: syntax.Type[]): syntax.Type {
  if (types.length == 1)
    return types[0];
  // For unions, add all subtypes to the merged type's subtypes, for other types
  // add themselves to the subtypes.
  let subtypes: syntax.Type[] = [];
  for (const type of types) {
    if (type.category == 'union')
      subtypes.push(...type.types);
    else
      subtypes.push(type);
  }
  subtypes = uniqueArray(subtypes, (x, y) => x.equal(y));
  const name = subtypes.map(t => t.name).join(' | ');
  const mergedType = new syntax.Type(name, 'union');
  mergedType.types = subtypes;
  mergedType.setModifiers(types[0].getModifiers());
  return mergedType;
}
