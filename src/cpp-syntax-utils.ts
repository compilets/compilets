import {
  Type,
  RawExpression,
  ClassDeclaration,
  ClassElement,
  PropertyDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  Block,
  ExpressionStatement,
  DeclarationStatement,
} from './cpp-syntax';

/**
 * Create the Trace method required by cppgc::GarbageCollected.
 */
export function createTraceMethod(members: ClassElement[]): MethodDeclaration | null {
  // Collect all the GCed members from the class.
  const body = new Block();
  for (const member of members) {
    if (member instanceof PropertyDeclaration) {
      if (!member.type.isGCedClass())
        continue;
      const expr = `visitor->Trace(${member.name})`;
      body.statements.push(new ExpressionStatement(new RawExpression(expr)));
    }
  }
  if (body.statements.length == 0)
    return null;
  // Create the visitor parameter.
  const visitor = new ParameterDeclaration('visitor', new Type('cppgc::Visitor', 'raw-class'));
  // Create the method.
  return new MethodDeclaration('Trace', [ 'public', 'override', 'const' ], new Type('void', 'void'), [ visitor ], body);
}

/**
 * Iterate through declarations to find out usages of STL headers.
 */
export interface STLUsages {
  useOptional: boolean;
}
export function getSTLUsages(decls: DeclarationStatement[]): STLUsages {
  const result = {useOptional: false};
  for (const decl of decls) {
    if (decl instanceof ClassDeclaration) {
      for (const member of decl.getMembers()) {
        if (member instanceof PropertyDeclaration) {
          if (member.type.optional)
            result.useOptional = true;
        }
      }
    }
  }
  return result;
}
