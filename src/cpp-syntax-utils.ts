import {
  Type,
  FunctionType,
  Expression,
  RawExpression,
  NumericLiteral,
  ArrayLiteralExpression,
  ConditionalExpression,
  CustomExpression,
  ClassElement,
  PropertyDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  Block,
  ExpressionStatement,
} from './cpp-syntax';
import {
  printExpressionValue,
} from './print-utils';
import {
  joinArray,
} from './js-utils';

/**
 * Return whether the members are trivially destrutible.
 */
export function notTriviallyDestructible(members: ClassElement[]): boolean {
  return members.filter(m => m instanceof PropertyDeclaration)
                .some(m => !m.type.isTriviallyDestructible());
}

/**
 * Create the Trace method required by cppgc::GarbageCollected.
 */
export function createTraceMethod(type: Type, members: ClassElement[]): MethodDeclaration | undefined {
  // Collect all the GCed members from the class.
  const body = new Block();
  for (const member of members) {
    if (member instanceof PropertyDeclaration) {
      let traceMethod: string | undefined;
      if (member.type.hasObject())
        traceMethod = 'compilets::TraceMember';
      else if (member.type.hasTemplate())
        traceMethod = 'compilets::TracePossibleMember';
      if (traceMethod) {
        body.statements.push(
          new ExpressionStatement(
            new RawExpression(Type.createVoidType(),
                              `${traceMethod}(visitor, ${member.name})`)));
      }
    }
  }
  if (body.statements.length == 0)
    return;
  if (type.base) {
    body.statements.push(
      new ExpressionStatement(
        new RawExpression(new Type('void', 'void'),
                          `${type.base.name}::Trace(visitor)`)));
  }
  // Create the visitor parameter.
  const visitorType = new Type('cppgc::Visitor*', 'external');
  const visitor = new ParameterDeclaration('visitor', visitorType);
  // Create the method.
  const methodType = new FunctionType('method', Type.createVoidType(), [ visitorType ]);
  return new MethodDeclaration(methodType, 'Trace', [ 'public', 'override', 'const' ], [ visitor ], body);
}

/**
 * Convert the expression of source type to target type if necessary.
 */
export function castExpression(expr: Expression, target: Type, source?: Type): Expression {
  if (target.category == 'any')
    return expr;
  // The operands of ?: do not necessarily have same type.
  if (expr instanceof ConditionalExpression) {
    expr.whenTrue = strictCastExpression(expr.whenTrue, target);
    expr.whenFalse = strictCastExpression(expr.whenFalse, target);
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
  // The numeric literal's type is dynamic, it could be the target type if it
  // is a direct assignment, otherwise it requires a explicit conversion.
  if (expr instanceof NumericLiteral) {
    if (target.category == 'primitive')
      return expr;
    return new CustomExpression(target, (ctx) => {
      return `static_cast<double>(${expr.print(ctx)})`;
    });
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
  // We don't support using methods as functors yet.
  if (source.category == 'method' && target.category == 'functor')
    throw new Error('Can not use method as function');
  // Convert function pointer to functor object.
  if (source.category == 'function' && target.category == 'functor') {
    return new CustomExpression(target, (ctx) => {
      ctx.features.add('function');
      const signature = (target as FunctionType).getSignature();
      return `compilets::MakeFunction<${signature}>(${expr.print(ctx)})`;
    });
  }
  // Convert between primitive types.
  if (source.category == 'primitive' && target.category == 'primitive') {
    if (source.name == target.name)
      return expr;
    return new CustomExpression(target, (ctx) => {
      return `static_cast<${target.name}>(${expr.print(ctx)})`;
    });
  }
  // Whether the types can be assigned without any explicit conversion.
  if (target.assignableWith(source)) {
    return expr;
  }
  // In C++ interfaces are not compatible with other types.
  if (source.category == 'interface' || target.category == 'interface')
    throw new Error('Can not convert type from/to interfaces');
  // Use the universal Cast function.
  return new CustomExpression(target, (ctx) => {
    expr.type.markUsed(ctx);
    return `compilets::Cast<${target.print(ctx)}>(${expr.print(ctx)})`;
  });
}

/**
 * Do strict casting even when the expression can be implictly converted to
 * target type.
 */
export function strictCastExpression(expr: Expression, target: Type): Expression {
  const source = expr.type;
  // Get value from cppgc smart pointers.
  if ((source.isCppgcMember() && !target.isCppgcMember()) ||
      (source.isPersistent && !target.isPersistent)) {
    return new CustomExpression(source, (ctx) => {
      return `${printExpressionValue(expr, ctx)}.Get()`;
    });
  }
  // Create cppgc smart pointers.
  if ((!source.isCppgcMember() && target.isCppgcMember()) ||
      (!source.isPersistent && target.isPersistent)) {
    return new CustomExpression(source, (ctx) => {
      return `${target.print(ctx)}(${expr.print(ctx)})`;
    });
  }
  return castExpression(expr, target);
}

/**
 * Convert args to parameter types.
 */
export function castArguments(args: Expression[], parameters: Type[]) {
  for (let i = 0; i < args.length; ++i) {
    let param: Type;
    if (i > parameters.length - 1) {
      if (!parameters[parameters.length - 1].isVariadic)
        throw new Error('More arguments passed than the function can take.');
      param = parameters[parameters.length - 1];
    } else {
      param = parameters[i];
    }
    if (param.isVariadic && !param.isExternal) {
      // When meet a rest parameter, put remaining args in an array.
      const callArgs = args.slice(i).map(a => castExpression(a, param.getElementType()));
      args[i] = new CustomExpression(param, (ctx) => {
        return `compilets::MakeArray<${param.getElementType().print(ctx)}>({${callArgs.map(a => a.print(ctx)).join(', ')}})`;
      });
      return args.slice(0, i + 1);
    }
    args[i] = castExpression(args[i], param.isVariadic ? param.getElementType()
                                                       : param);
  }
  return args;
}

/**
 * Conversions involving unions.
 */
export function castUnion(expr: Expression, target: Type, source: Type): Expression {
  // From non-union to union.
  if (source.category != 'union' && target.category == 'union') {
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
    if (!subtype) {
      // When casting to types like size_t, convert to double and try again.
      if (target.isNonJsPrimitive())
        return castUnion(expr, Type.createNumberType(), source);
      throw new Error(`The union "${source.name}" does not contain the target type "${target.name}"`);
    }
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
  // Use helper when there is template type.
  if (source.category == 'template' || target.category == 'template') {
    if (source.isOptional) {
      return new CustomExpression(target, (ctx) => {
        return `compilets::GetOptionalValue(${expr.print(ctx)})`;
      });
    }
  }
  // Convert null to std::nullopt.
  if (source.category == 'null' && target.isStdOptional()) {
    if (target.isProperty)
      return expr;
    return new CustomExpression(target, (ctx) => 'std::nullopt');
  }
  // Get the optional value first before converting to other types.
  if (source.isStdOptional() && !target.isStdOptional()) {
    return new CustomExpression(source.noOptional(), (ctx) => {
      return `${printExpressionValue(expr, ctx)}.value()`;
    });
  }
  return expr;
}
