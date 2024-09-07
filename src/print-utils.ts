import * as syntax from './cpp-syntax';
import {Type, FunctionType} from './cpp-syntax-type';
import {joinArray} from './js-utils';

/**
 * Possible modes for printing the syntax node.
 */
export type PrintMode = 'impl' | 'header' | 'forward';

/**
 * Optional C++ features used in the code.
 */
export type Feature = 'string' | 'union' | 'array' | 'function' | 'object' |
                      'converters' | 'runtime' | 'type-traits' | 'process' |
                      'console' | 'math' | 'number';

/**
 * Control indentation and other formating options when printing AST to C++.
 */
export class PrintContext {
  /**
   * The print mode.
   */
  mode: PrintMode;
  /**
   * How many spaces for 1 indentation.
   */
  indent: number;
  /**
   * Current namespace.
   */
  namespace: string | undefined;
  /**
   * The depth of indentation.
   */
  level = 0;
  /**
   * Namespaces get aliases with "import * as name".
   */
  namespaceAliases = new Map<string, string>();
  /**
   * Type names get aliases with "import {x as y}".
   */
  typeAliases = new Map<string, string>();
  /**
   * Used class/function type names when printing.
   */
  usedTypes = new Set<string>();
  /**
   * Used C++ features when printing.
   */
  features = new Set<Feature>();
  /**
   * Used interfaces when printing.
   */
  interfaces = new Set<string>();
  /**
   * The features that used in the included headers.
   */
  includedFeatures?: Set<Feature>;
  /**
   * The interfaces that printed in the included headers.
   */
  includedInterfaces?: Set<string>;
  /**
   * Whether the node should put padding in the beginning.
   * TODO(zcbenz): This was introduced to handle the formatting of if statement,
   * consider using a better approach.
   */
  concatenateNextLine = false;

  constructor(mode: PrintMode, indent: number = 2) {
    this.mode = mode;
    this.indent = indent;
  }

  get padding() {
    return ' '.repeat(this.level * this.indent);
  }

  get prefix() {
    if (this.concatenateNextLine) {
      this.concatenateNextLine = false;
      return '';
    }
    return this.padding;
  }

  join() {
    this.concatenateNextLine = true;
    return this;
  }
}

/**
 * Helper to change the context's members in a scope.
 */
export class PrintContextScope implements Disposable {
  ctx: PrintContext;
  savedProperties: Partial<PrintContext>;

  constructor(ctx: PrintContext, updates: Partial<PrintContext>) {
    this.ctx = ctx;
    this.savedProperties = {};
    for (const key of Object.getOwnPropertyNames(updates))
      (this.savedProperties as any)[key] = this.ctx[key as keyof PrintContext];
    Object.assign(ctx, updates);
  }

  [Symbol.dispose]() {
    for (const key of Object.getOwnPropertyNames(this.savedProperties))
      (this.ctx as any)[key] = this.savedProperties[key as keyof PrintContext];
  }
}

/**
 * Print the class declaration.
 */
export function printClassDeclaration(decl: syntax.ClassDeclaration, ctx: PrintContext): string {
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
    throw new Error('Can not print non-exported class in header');
  // Exported template class always live in header.
  if (decl.isExported && templateDeclaration && ctx.mode == 'impl')
    throw new Error('Can not print exported template class in implementation');
  // Add empty line between methods.
  const getSeparator = (a: syntax.ClassElement, b: syntax.ClassElement) => {
    if (a instanceof syntax.PropertyDeclaration && !a.type.isStatic &&
        b instanceof syntax.PropertyDeclaration && !b.type.isStatic)
      return '\n';
    else
      return '\n\n';
  };
  // Print method definitions in .cpp file.
  if (decl.isExported && !templateDeclaration && ctx.mode == 'impl') {
    return joinArray(
      decl.getMembers().filter(m => {
        // The non-static members do not need definition.
        return !(m instanceof syntax.PropertyDeclaration && !m.type.isStatic);
      }),
      getSeparator,
      (m) => m.print(ctx));
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
    result += joinArray(decl.publicMembers, getSeparator, (m) => m.print(ctx));
    result += '\n';
  }
  if (decl.protectedMembers.length > 0) {
    if (decl.publicMembers.length > 0)
      result += '\n';
    result += `${halfPadding}protected:\n`;
    result += joinArray(decl.protectedMembers, getSeparator, (m) => m.print(ctx));
    result += '\n';
  }
  if (decl.privateMembers.length > 0) {
    if (decl.publicMembers.length > 0 || decl.protectedMembers.length > 0)
      result += '\n';
    result += `${halfPadding}private:\n`;
    result += joinArray(decl.privateMembers, getSeparator, (m) => m.print(ctx));
    result += '\n';
  }
  ctx.level--;
  result += ctx.padding + '};';
  // Print definitions for static members.
  if (ctx.mode == 'impl') {
    const staticMembers = decl.getMembers().filter(m => m instanceof syntax.PropertyDeclaration && m.modifiers.includes('static'));
    if (staticMembers.length > 0)
      result += '\n\n';
    for (const m of staticMembers) {
      const member = m as syntax.PropertyDeclaration;
      result += `${member.type.print(ctx)} ${decl.name}::${member.name}`;
      if (member.initializer)
        result += ` = ${member.initializer.print(ctx)}`;
      result += ';';
    }
  }
  return result;
}

/**
 * Print the kizunapi bindings of interface.
 */
export function printInterfaceBinding(type: syntax.InterfaceType, ctx: PrintContext) {
  const properties = Array.from(type.properties.keys());
  const setProps = properties.map(prop => `, "${prop}", obj->${prop}`);
  const getProps = properties.map(prop => `, "${prop}", &obj->${prop}`);
  return `template<>
struct Type<${type.name}*> {
  static constexpr const char* name = "${type.name}";

  static napi_status ToNode(napi_env env, const ${type.name}* obj, napi_value* result) {
    napi_status s = napi_create_object(env, result);
    if (s != napi_ok)
      return s;
    if (!ki::Set(env, *result${setProps.join('')}))
      return napi_generic_failure;
    return napi_ok;
  }

  static std::optional<${type.name}*> FromNode(napi_env env, napi_value value) {
    ${type.name}* obj = compilets::MakeObject<${type.name}>();
    if (!ki::Get(env, value${getProps.join('')}))
      return std::nullopt;
    return obj;
  }
};`;
}

/**
 * Print and add parentheses when needed.
 */
export function printExpressionValue(expr: syntax.Expression, ctx: PrintContext) {
  const result = expr.print(ctx);
  if (expr.shouldAddParenthesesForPropertyAccess)
    return `(${result})`;
  return result;
}

/**
 * Print the template arguments for the type.
 */
export function printTypeTemplateArguments(type: Type, ctx: PrintContext): string {
  if (type.category == 'function' || type.category == 'method')
    return printTemplateArguments(type.templateArguments, ctx);
  return '';
}

/**
 * Print the template arguments.
 */
export function printTemplateArguments(args: Type[] | undefined, ctx: PrintContext): string {
  if (!args || args.length == 0)
    return '';
  return `<${args.map(a => printTypeName(a, ctx)).join(', ')}>`;
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
export function printTypeName(type: Type, ctx: PrintContext): string {
  if (type.category == 'function' || type.category == 'method') {
    throw new Error('Raw function type should never be printed out');
  }
  // Add wrapper for array.
  if (type.category == 'array') {
    return `compilets::Array<${printTypeNameForDeclaration(type.getElementType().noProperty(), ctx)}>`;
  }
  // Add wrapper for functor.
  if (type.category == 'functor') {
    return `compilets::Function<${(type as FunctionType).getSignature(ctx)}>`;
  }
  // Add wrapper for union.
  if (type.category == 'union') {
    const types = type.types!.map(t => printTypeNameForDeclaration(t.noProperty(), ctx));
    // Make monostate always appear at first so the union defaults to undefined.
    if (type.isOptional)
      types.unshift('std::monostate');
    return `compilets::Union<${types.join(', ')}>`;
  }
  // The remainings are class and primitive types.
  let name = type.name;
  // Add namespace.
  if (type.namespace) {
    name = addNamespace(name, type.namespace, ctx);
  }
  // Add type arguments.
  if (type.category == 'class' && type.templateArguments) {
    name += printTemplateArguments(type.templateArguments, ctx);
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
export function printTypeNameForDeclaration(type: Type, ctx: PrintContext): string {
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
      name = `compilets::Array<${printTypeNameForDeclaration(type.getElementType(), ctx)}>`;
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
    const types = type.types!.map(t => printTypeNameForDeclaration(t, ctx));
    if (type.isOptional)
      types.unshift('std::monostate');
    return `compilets::Union<${types.join(', ')}>`;
  }
  // Other types are the same with their formal C++ type name.
  return printTypeName(type, ctx);
}

/**
 * Add namespace to the identifier according to current context.
 */
export function addNamespace(identifier: string, namespace: string, ctx: PrintContext) {
  // Get the alias of the namespace.
  const alias = ctx.namespaceAliases.get(namespace) ?? namespace;
  // Add namespace to identifier according to context's namespace.
  if (!ctx || !ctx.namespace || !alias.startsWith(ctx.namespace))
    identifier = `${alias}::${identifier}`;
  else if (alias != ctx.namespace)
    identifier = `${alias.substr(ctx.namespace.length)}::${identifier}`;
  // Get the type alias when available.
  identifier = ctx.typeAliases.get(identifier) ?? identifier;
  // Shorten the namespace according to context's namespace.
  if (ctx.namespace && identifier.startsWith(ctx.namespace))
    identifier = identifier.substr(ctx.namespace.length + 2);
  return identifier;
}

