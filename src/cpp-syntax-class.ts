import {
  Type,
  RawExpression,
  ClassDeclaration,
  PropertyDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  Block,
  ExpressionStatement,
} from './cpp-syntax';

/**
 * Create the Trace method required by cppgc::GarbageCollected.
 */
export function createTraceMethod(cl: ClassDeclaration) {
  // Collect all the GCed members from the class.
  const body = new Block();
  for (const members of [ cl.publicMembers, cl.protectedMembers, cl.privateMembers ]) {
    for (const member of members) {
      if (member instanceof PropertyDeclaration) {
        if (!member.type.isGCedClass())
          continue;
        const expr = `visitor->Trace(${member.name})`;
        body.statements.push(new ExpressionStatement(new RawExpression(expr)));
      }
    }
  }
  // Create the visitor parameter.
  const visitor = new ParameterDeclaration('visitor', new Type('cppgc::Visitor', 'raw-class'));
  // Create the method.
  return new MethodDeclaration('Trace', [ 'public', 'const' ], new Type('void', 'void'), [ visitor ], body);
}
