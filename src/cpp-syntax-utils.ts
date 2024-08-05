import {
  PrintContext,
  Type,
  Expression,
  RawExpression,
  CustomExpression,
  ClassDeclaration,
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
 * Print the class declaration.
 */
export function printClassDeclaration(decl: ClassDeclaration, ctx: PrintContext): string {
  if (ctx.mode == 'forward')
    return `class ${decl.name};`;
  const halfPadding = ctx.padding + ' '.repeat(ctx.indent / 2);
  // Print class name and inheritance.
  const inheritance = decl.type.isGCedType() ? ' : public compilets::Object' : '';
  let result = `${ctx.prefix}class ${decl.name}${inheritance} {\n`;
  ctx.level++;
  // Print the finalizer macro.
  if (decl.destructor) {
    result += `${ctx.padding}CPPGC_USING_PRE_FINALIZER(${decl.name}, ${decl.destructor.name});\n`;
  }
  // Print members.
  if (decl.publicMembers.length > 0) {
    result += `${halfPadding}public:\n`;
    result += decl.publicMembers.map(m => m.print(ctx) + '\n\n').join('');
  }
  if (decl.protectedMembers.length > 0) {
    result += `${halfPadding}protected:\n`;
    result += decl.protectedMembers.map(m => m.print(ctx) + '\n\n').join('');
  }
  if (decl.privateMembers.length > 0) {
    result += `${halfPadding}private:\n`;
    result += decl.privateMembers.map(m => m.print(ctx) + '\n\n').join('');
  }
  ctx.level--;
  if (result.endsWith('\n\n'))
    result = result.slice(0, -1);
  result += ctx.padding + '};';
  // Print definitions for static members.
  if (ctx.mode == 'impl') {
    const staticMembers = decl.getMembers().filter(m => m instanceof PropertyDeclaration && m.modifiers.includes('static'));
    if (staticMembers.length > 0)
      result += '\n\n';
    for (const m of staticMembers) {
      const member = m as PropertyDeclaration;
      result += `${member.type.print(ctx)} ${decl.name}::${member.name}`;
      if (member.initializer)
        result += ` = ${member.initializer.print(ctx)}`;
      result += ';\n';
    }
  }
  if (!result.endsWith('\n'))
    result += '\n';
  return result;
}

/**
 * Convert the expression of source type to target type if necessary.
 */
export function castExpression(expr: Expression, target: Type): Expression {
  const source = expr.type;
  if (source.equal(target))
    return expr;
  // Union to union requires explicit conversation.
  if (source.category == 'union' && target.category == 'union') {
    return new CustomExpression(target, (ctx) => {
      return `compilets::CastVariant(${expr.print(ctx)})`;
    });
  }
  if (target.category == 'union') {
    // Number literal in C++ is not necessarily double.
    if (source.name == 'double' && source.category == 'primitive') {
      return new CustomExpression(source, (ctx) => {
        return `static_cast<double>(${expr.print(ctx)})`;
      });
    }
    return expr;
  }
  // Union to subtype requires explicit conversation.
  if (source.category == 'union') {
    return new CustomExpression(source, (ctx) => {
      return `std::get<${target.print(ctx)}>(${expr.print(ctx)})`;
    });
  }
  // Accessing the .value() property of optional types.
  if (source.isOptional() && !target.isOptional()) {
    return new CustomExpression(source, (ctx) => {
      return `${expr.addParentheses(expr.print(ctx))}.value()`;
    });
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
export function castArguments(args: Expression[], targetTypes: Type[]) {
  for (let i = 0; i < args.length; ++i)
    args[i] = castExpression(args[i], targetTypes[i]);
  return args;
}
