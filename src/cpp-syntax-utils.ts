import {
  PrintContext,
  Type,
  Expression,
  RawExpression,
  CustomExpression,
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
      if (!member.type.hasGCedType())
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
  if (expr.type.category == 'union' && expr.type.isOptional()) {
    return new CustomExpression(new Type('bool', 'primitive'), (ctx) => {
      return `std::holds_alternative<std::monostate>(${expr.print(ctx)})`;
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
  // Do nothing if same type.
  source = source ?? expr.type;
  if (source.equal(target))
    return expr;
  if (source.category == 'union' || target.category == 'union') {
    // Parse union conversions, save the result and continue parsing.
    expr = castUnion(expr, target, source);
    source = expr.type;
  } else if (source.isOptional() || target.isOptional()) {
    // Parse optional types otherwise, as optional union is still an union.
    return castOptional(expr, target, source);
  }
  // Get value from GCed members.
  if ((source.isProperty() && source.isGCedType()) &&
      !(target.isProperty() && target.isGCedType())) {
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
  return expr;
}

/**
 * Compare the sourceTypes and targetTypes, and do conversion when required.
 */
export function castArguments(args: Expression[], targetTypes: Type[]) {
  for (let i = 0; i < args.length; ++i)
    args[i] = castExpression(args[i], targetTypes[i]);
  return args;
}

// Conversions involving unions.
function castUnion(expr: Expression, target: Type, source: Type): Expression {
  // Use the C++ helper to convert between unions.
  if (source.category == 'union' && target.category == 'union') {
    return new CustomExpression(target, (ctx) => {
      return `compilets::CastVariant(${expr.print(ctx)})`;
    });
  }
  // From non-union to union.
  if (target.category == 'union') {
    // Number literal in C++ is not necessarily double.
    if (source.name == 'double' && source.category == 'primitive') {
      return new CustomExpression(source, (ctx) => {
        return `static_cast<double>(${expr.print(ctx)})`;
      });
    }
    // Convert null to std::monostate.
    if (source.category == 'null')
      return new CustomExpression(source, (ctx) => 'std::monostate{}');
    // Find the target subtype and do an explicit conversion.
    const subtype = target.types.find(t => t.equal(source));
    if (!subtype)
      throw new Error(`The target union "${target.name}" does not contain the source type "${source.name}"`);
    return castExpression(expr, subtype);
  }
  // From union to non-union.
  if (source.category == 'union') {
    const subtype = source.types.find(t => t.equal(target));
    if (!subtype)
      throw new Error('The union does not contain the target type');
    return new CustomExpression(subtype, (ctx) => {
      return `std::get<${subtype.print(ctx)}>(${expr.print(ctx)})`;
    });
  }
  throw new Error('Not reached');
}

// Conversions between optionals.
function castOptional(expr: Expression, target: Type, source: Type): Expression {
  // Convert null to std::nullopt.
  if (source.category == 'null' && target.isStdOptional()) {
    if (target.isProperty())
      return expr;
    return new CustomExpression(source, (ctx) => 'std::nullopt');
  }
  // Add .value() when accessing value.
  if (source.isStdOptional() && !target.isStdOptional()) {
    return new CustomExpression(source, (ctx) => {
      return `${printExpressionValue(expr, ctx)}.value()`;
    });
  }
  // Add .Get() when accessing property.
  if (source.isGCedType() && source.isProperty() &&
      !(target.isGCedType() && target.isProperty())) {
    return new CustomExpression(source, (ctx) => {
      return `${printExpressionValue(expr, ctx)}.Get()`;
    });
  }
  return castExpression(expr, target.noOptional(), source.noOptional());
}
