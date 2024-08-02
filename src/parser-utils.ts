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
 * Return the names and types of outer variables referenced by the function.
 */
export function getFunctionClosure(typeChecker: ts.TypeChecker,
                                   func: ts.FunctionDeclaration |
                                         ts.FunctionExpression |
                                         ts.ArrowFunction) {
  const closure: ts.Identifier[] = [];
  for (const node of filterNode(func.body, ts.isIdentifier)) {
    const symbol = typeChecker.getSymbolAtLocation(node);
    if (!symbol)
      throw new UnimplementedError(node, 'An identifier in function without symbol');
    if (!ts.findAncestor(symbol.valueDeclaration, (n) => n == func))
      closure.push(node as ts.Identifier);
  }
  return closure;
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
    result = new syntax.Type('void()', 'function');
  if (result)
    result.namespace = 'compilets';
  return result;
}
