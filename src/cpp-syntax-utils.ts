import {
  PrintContext,
  Type,
  Expression,
  RawExpression,
  CustomExpression,
  ArrayLiteralExpression,
  ConditionalExpression,
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
      if (!member.type.hasObject())
        continue;
      body.statements.push(
        new ExpressionStatement(
          new RawExpression(new Type('void', 'void'),
                            `TraceHelper(visitor, ${member.name})`)));
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
  const inheritance = decl.type.isObject() ? ' : public compilets::Object' : '';
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
 * Print and add parentheses when needed.
 */
export function printExpressionValue(expr: Expression, ctx: PrintContext) {
  const result = expr.print(ctx);
  if (expr.shouldAddParenthesesForPropertyAccess)
    return `(${result})`;
  return result;
}

/**
 * Convert expression to if conditions.
 */
export function ifExpression(expr: Expression): Expression {
  if (expr.type.category == 'union' && expr.type.isOptional) {
    return new CustomExpression(new Type('bool', 'primitive'), (ctx) => {
      return `!std::holds_alternative<std::monostate>(${expr.print(ctx)})`;
    });
  }
  return expr;
}

/**
 * Convert the expression of source type to target type if necessary.
 */
export function castExpression(expr: Expression, target: Type, source?: Type): Expression {
  // The operands of ?: do not necessarily have same type.
  if (expr instanceof ConditionalExpression) {
    expr.whenTrue = castExpression(expr.whenTrue, target);
    expr.whenFalse = castExpression(expr.whenFalse, target);
    return expr;
  }
  // The array literal's type depends on the target type.
  if (expr instanceof ArrayLiteralExpression && target.category == 'array') {
    // Change array type to target type if:
    // 1. This is an empty array, i.e. [].
    // 2. The element type is directly assignable to target type.
    if (expr.elements.length == 0 ||
        target.getElementType().assignableWith(expr.type.getElementType())) {
      expr.type.types[0] = target.getElementType().clone();
      expr.elements = expr.elements.map(e => castExpression(e, expr.type.getElementType()));
      return expr;
    }
  }
  source = source ?? expr.type;
  // Parse composited types.
  if (source.category == 'union' || target.category == 'union') {
    expr = castUnion(expr, target, source);
    source = expr.type;
  } else if (source.isOptional || target.isOptional) {
    expr = castOptional(expr, target, source);
    source = expr.type;
  }
  // Get value from GCed members.
  if (source.isCppgcMember() && !target.isCppgcMember()) {
    return new CustomExpression(source, (ctx) => {
      return `${printExpressionValue(expr, ctx)}.Get()`;
    });
  }
  // Convert function pointer to functor object.
  if (source.category == 'function' && target.category == 'functor') {
    return new CustomExpression(target, (ctx) => {
      return `compilets::MakeFunction<${target.name}>(${expr.print(ctx)})`;
    });
  }
  // Whether the types can be assigned without any explicit conversion.
  if (target.assignableWith(source))
    return expr;
  // Use the universal Cast function.
  return new CustomExpression(target, (ctx) => {
    return `compilets::Cast<${target.print(ctx)}>(${expr.print(ctx)})`;
  });
}

/**
 * Convert args to parameter types.
 */
export function castArguments(args: Expression[], parameters: ParameterDeclaration[]) {
  for (let i = 0; i < args.length; ++i) {
    const param = parameters[i];
    if (param.variadic) {
      // When meet a rest parameter, put remaining args in an array.
      const callArgs = args.slice(i).map(a => castExpression(a, param.type.getElementType()));
      args[i] = new CustomExpression(param.type, (ctx) => {
        return `compilets::MakeArray<${param.type.getElementType().print(ctx)}>({${callArgs.map(a => a.print(ctx)).join(', ')}})`;
      });
      return args.slice(0, i + 1);
    }
    args[i] = castExpression(args[i], param.type);
  }
  return args;
}

/**
 * Conversions involving unions.
 */
export function castUnion(expr: Expression, target: Type, source: Type): Expression {
  // From non-union to union.
  if (source.category != 'union' && target.category == 'union') {
    // Number literal in C++ is not necessarily double.
    if (source.name == 'double' && source.category == 'primitive') {
      return new CustomExpression(source, (ctx) => {
        return `static_cast<double>(${expr.print(ctx)})`;
      });
    }
    // Convert null to std::monostate.
    if (source.category == 'null')
      return new CustomExpression(target, (ctx) => 'std::monostate{}');
    // Find the target subtype and do an explicit conversion.
    const subtype = target.types.find(t => t.equal(source));
    if (!subtype)
      throw new Error(`The target union "${target.name}" does not contain the source type "${source.name}"`);
    return castExpression(expr, subtype);
  }
  // From union to non-union.
  if (source.category == 'union' && target.category != 'union') {
    const subtype = source.types.find(t => t.equal(target));
    if (!subtype)
      throw new Error('The union does not contain the target type');
    return new CustomExpression(subtype, (ctx) => {
      return `std::get<${subtype.print(ctx)}>(${expr.print(ctx)})`;
    });
  }
  return expr;
}

/**
 * Conversions between optionals.
 */
export function castOptional(expr: Expression, target: Type, source: Type): Expression {
  // Convert null to std::nullopt.
  if (source.category == 'null' && target.isStdOptional()) {
    if (target.isProperty)
      return expr;
    return new CustomExpression(target, (ctx) => 'std::nullopt');
  }
  // Add .value() when accessing value.
  if (source.isStdOptional() && !target.isStdOptional()) {
    return new CustomExpression(target, (ctx) => {
      return `${printExpressionValue(expr, ctx)}.value()`;
    });
  }
  return expr;
}
