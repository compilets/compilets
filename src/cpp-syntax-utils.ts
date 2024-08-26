import {
  PrintContext,
  Type,
  FunctionType,
  Expression,
  RawExpression,
  NumericLiteral,
  ArrayLiteralExpression,
  ConditionalExpression,
  CustomExpression,
  ClassDeclaration,
  ClassElement,
  ConstructorDeclaration,
  DestructorDeclaration,
  PropertyDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  Block,
  ExpressionStatement,
} from './cpp-syntax';

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
        traceMethod = 'TraceMember';
      else if (member.type.hasTemplate())
        traceMethod = 'compilets::TracePossibleMember';
      if (traceMethod) {
        body.statements.push(
          new ExpressionStatement(
            new RawExpression(new Type('void', 'void'),
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
  const methodType = new FunctionType('function', Type.createVoidType(), [ visitorType ]);
  return new MethodDeclaration(methodType, 'Trace', [ 'public', 'override', 'const' ], [ visitor ], body);
}

/**
 * Print the class declaration.
 */
export function printClassDeclaration(decl: ClassDeclaration, ctx: PrintContext): string {
  // Forward declaration.
  const templateDeclaration = printTemplateDeclaration(decl.type);
  if (ctx.mode == 'forward') {
    let result = `class ${decl.type.name};`;
    if (templateDeclaration)
      return templateDeclaration + '\n' + result;
    return result;
  }
  // Do not expose in header if class is not exported.
  if (!decl.isExported && ctx.mode == 'header')
    return '';
  // Exported template class always live in header.
  if (decl.isExported && templateDeclaration && ctx.mode == 'impl')
    return '';
  // Print method declarations.
  if (decl.isExported && !templateDeclaration && ctx.mode == 'impl') {
    const methods = decl.getMembers()
                        .filter(m => m instanceof PropertyDeclaration ||
                                     m instanceof MethodDeclaration ||
                                     m instanceof ConstructorDeclaration ||
                                     m instanceof DestructorDeclaration)
                        .map(m => m.print(ctx))
                        .filter(s => s.length > 0);
    return methods.join('\n\n') + '\n';
  }
  // Print class name and inheritance.
  const base = decl.type.base ? printTypeName(decl.type.base, ctx) : 'compilets::Object';
  let result = `${ctx.prefix}class ${decl.name} : public ${base} {\n`;
  if (templateDeclaration)
    result = ctx.prefix + templateDeclaration + '\n' + result;
  // Indent for class content.
  const halfPadding = ctx.padding + ' '.repeat(ctx.indent / 2);
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
 * Print the template arguments..
 */
export function printTemplateArguments(args?: Type[]): string {
  if (!args || args.length == 0)
    return '';
  return `<${args.map(a => printTypeName(a)).join(', ')}>`;
}

/**
 * Print the template clause.
 */
export function printTemplateDeclaration(type: Type): string | undefined {
  if (type.types.length == 0)
    return;
  const typenames = type.types.map(t => `typename ${t.name}`);
  return `template<${typenames.join(', ')}>`;
}

/**
 * Print the type name used as template argument.
 *
 * It is also used for class inheritance.
 */
export function printTypeName(type: Type, ctx?: PrintContext): string {
  if (type.category == 'function' || type.category == 'method') {
    throw new Error('Raw function type should never be printed out');
  }
  // Add wrapper for array.
  if (type.category == 'array') {
    return `compilets::Array<${printTypeNameForDeclaration(type.getElementType().noProperty())}>`;
  }
  // Add wrapper for functor.
  if (type.category == 'functor') {
    return `compilets::Function<${(type as FunctionType).getSignature(ctx)}>`;
  }
  // Add wrapper for union.
  if (type.category == 'union') {
    const types = type.types!.map(t => printTypeNameForDeclaration(t.noProperty()));
    if (type.isOptional)
      types.push('std::monostate');
    return `compilets::Union<${types.join(', ')}>`;
  }
  // The null means many types in C++, in the occasional cases where it needs
  // to be printed, use std::nullptr_t.
  if (type.category == 'null') {
    return 'std::nullptr_t';
  }
  // The any type is not supported yet but it shows in signatures.
  if (type.category == 'any') {
    return '_Any';
  }
  // The remainings are class and primitive types.
  let name = type.name;
  // Add type arguments.
  if (type.category == 'class' && type.templateArguments) {
    name += printTemplateArguments(type.templateArguments);
  }
  // Add namespace.
  if (type.namespace && !(ctx?.namespace == type.namespace)) {
    name = `${type.namespace}::${name}`;
  }
  // Add optional when needed.
  if (type.isStdOptional()) {
    return `std::optional<${name}>`;
  }
  return name;
}

/**
 * Print the type name used for declaration of values.
 */
export function printTypeNameForDeclaration(type: Type, ctx?: PrintContext): string {
  // Template's type name is alway wrapped with type traits.
  if (type.category == 'template') {
    if (type.isCppgcMember()) {
      if (type.isOptional)
        return `compilets::OptionalCppgcMemberType<${type.name}>`;
      else
        return `compilets::CppgcMemberType<${type.name}>`;
    } else {
      if (type.isOptional)
        return `compilets::OptionalValueType<${type.name}>`;
      else
        return `compilets::ValueType<${type.name}>`;
    }
  }
  // Object's type name is pointer to class.
  if (type.isObject()) {
    let name: string;
    // The type of array used for declaration is different from the formal type.
    if (type.category == 'array')
      name = `compilets::Array<${printTypeNameForDeclaration(type.getElementType())}>`;
    else
      name = printTypeName(type, ctx);
    // Use smart pointer or raw pointer.
    if (type.isPersistent)
      return `cppgc::Persistent<${name}>`;
    else if (type.isCppgcMember())
      return `cppgc::Member<${name}>`;
    else
      return `${name}*`;
  }
  // The type of union used for declaration is different from the formal type.
  if (type.category == 'union') {
    const types = type.types!.map(t => printTypeNameForDeclaration(t));
    if (type.isOptional)
      types.push('std::monostate');
    return `compilets::Union<${types.join(', ')}>`;
  }
  // Other types are the same with their formal C++ type name.
  return printTypeName(type, ctx);
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
      return `compilets::MakeFunction<${target.name}>(${expr.print(ctx)})`;
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
  // Use the universal Cast function.
  return new CustomExpression(target, (ctx) => {
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
  // Add .value() when accessing value.
  if (source.isStdOptional() && !target.isStdOptional()) {
    return new CustomExpression(target, (ctx) => {
      return `${printExpressionValue(expr, ctx)}.value()`;
    });
  }
  return expr;
}
