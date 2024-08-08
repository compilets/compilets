import * as ts from 'typescript';
import * as syntax from './cpp-syntax';

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
 * Helper to get all the child nodes.
 */
export function filterNode(node?: ts.Node, predicate?: (node: ts.Node) => boolean) {
  const results: ts.Node[] = [];
  if (!node)
    return results;
  const visit = (node: ts.Node) => {
    if (!predicate || predicate(node))
      results.push(node);
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
 * Return a proper type representation for Node.js objects.
 */
export function parseNodeJsType(node: ts.Node, type: ts.Type): syntax.Type | undefined {
  let result: syntax.Type | undefined;
  // The gc function is defined as optional.
  if (type.isUnion())
    type = (type as ts.UnionType).types.find(t => !(t.getFlags() & ts.TypeFlags.Undefined))!;
  // Get the type's original declaration.
  if (!type.symbol?.declarations || type.symbol.declarations.length == 0)
    return result;
  // Get the declaration from Node.js type file.
  const decl = type.symbol.declarations.find((decl) => {
    const sourceFile = decl.getSourceFile();
    return sourceFile.isDeclarationFile &&
           sourceFile.fileName.includes('node_modules/@types/node');
  });
  if (!decl)
    return result;
  // The process object.
  const name = type.symbol.name;
  if (name == 'Process')
    result = new syntax.Type('Process', 'class');
  else if (name == 'Console')
    result = new syntax.Type('Console', 'class');
  // The gc function.
  if (node.getText() == 'gc')
    result = new syntax.Type('gc', 'function');
  if (result)
    result.namespace = 'compilets';
  return result;
}

/*
 * Remove duplicate elements in the array.
 */
export function uniqueArray<T>(a: T[], compare: (item1: T, item2: T) => boolean): T[] {
  return a.filter((x, pos) => a.findIndex((y) => compare(x, y)) == pos);
}
