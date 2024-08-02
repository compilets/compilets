import {
  PrintContext,
  Type,
  Expression,
  RawExpression,
  CustomExpression,
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
      body.statements.push(
        new ExpressionStatement(
          new RawExpression(new Type('void', 'void'), expr)));
    }
  }
  if (body.statements.length == 0)
    return null;
  // Create the visitor parameter.
  const visitor = new ParameterDeclaration('visitor', new Type('cppgc::Visitor*', 'external'));
  // Create the method.
  return new MethodDeclaration('Trace', [ 'public', 'override', 'const' ], new Type('void', 'void'), [ visitor ], body);
}

/**
 * Convert the expression of source type to target type if necessary.
 */
export function castExpression(expr: Expression, source: Type, target: Type): Expression {
  if (source.equal(target))
    return expr;
  if (target.category == 'union') {
    // Number literal in C++ is not necessarily double.
    if (source.name == 'double' && source.category == 'primitive') {
      return new CustomExpression(source, (ctx) => {
        return `static_cast<double>(${expr.print(ctx)})`;
      });
    }
    // Union to union requires explicit conversation.
    if (source.category == 'union') {
      return new CustomExpression(target, (ctx) => {
        return `compilets::CastVariant(${expr.print(ctx)})`;
      });
    }
    return expr;
  }
  if (source.category == 'function' && target.category == 'functor') {
    // Convert function pointer to functor object.
    return new CustomExpression(target, (ctx) => {
      return `compilets::MakeFunction<${target.name}>(${expr.print(ctx)})`;
    });
  }
  throw new Error(`Unable to convert arg from ${source.category} to ${target.category}`);
}

/**
 * Compare the sourceTypes and targetTypes, and do conversation when required.
 */
export function castArguments(args: Expression[], sourceTypes: Type[], targetTypes: Type[]) {
  for (let i = 0; i < args.length; ++i)
    args[i] = castExpression(args[i], sourceTypes[i], targetTypes[i]);
  return args;
}
