import {
  Type,
  Expression,
  RawExpression,
  ToFunctorExpression,
  ClassElement,
  PropertyDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  Block,
  ExpressionStatement,
} from './cpp-syntax';

/**
 * Create the Trace method required by cppgc::GarbageCollected.
 */
export function createTraceMethod(members: ClassElement[]): MethodDeclaration | null {
  // Collect all the GCed members from the class.
  const body = new Block();
  for (const member of members) {
    if (member instanceof PropertyDeclaration) {
      if (!member.type.isGCedType())
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
 * Compare the sourceTypes and targetTypes, and do conversation when required.
 */
export function convertArgs(args: Expression[], sourceTypes: Type[], targetTypes: Type[]) {
  for (let i = 0; i < args.length; ++i) {
    if (sourceTypes[i].category == targetTypes[i].category) {
      continue;
    }
    if (sourceTypes[i].category == 'function' &&
        targetTypes[i].category == 'functor') {
      args[i] = new ToFunctorExpression(args[i]);
      continue;
    }
    throw new Error(`Unable to convert arg from ${sourceTypes[i].category} to ${targetTypes[i].category}`);
  }
  return args;
}
