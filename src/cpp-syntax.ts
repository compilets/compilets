import {
  createTraceMethod,
  printClassDeclaration,
  printExpressionValue,
  ifExpression,
  castExpression,
  castArguments,
  castOptional,
} from './cpp-syntax-utils';

/**
 * Possible modes for generating the project.
 */
export type GenerationMode = 'lib' | 'exe' | 'napi';

/**
 * Possible modes for printing the syntax node.
 */
export type PrintMode = 'impl' | 'header' | 'forward';

/**
 * Optional C++ features used in the code.
 */
export type Feature = 'optional' | 'string' | 'union' | 'array' | 'function' |
                      'object' | 'runtime' | 'process' | 'console';

/**
 * Control indentation and other formating options when printing AST to C++.
 */
export class PrintContext {
  /**
   * The generation mode.
   */
  generationMode: GenerationMode;
  /**
   * The print mode.
   */
  mode: PrintMode;
  /**
   * How many spaces for 1 indentation.
   */
  indent: number;
  /**
   * The depth of indentation.
   */
  level = 0;
  /**
   * Used C++ features when printing.
   */
  features = new Set<Feature>();
  /**
   * Whether the node should put padding in the beginning.
   * TODO(zcbenz): This was introduced to handle the formatting of if statement,
   * consider using a better approach.
   */
  concatenateNextLine = false;

  constructor(generationMode: GenerationMode, mode: PrintMode, indent: number = 2) {
    this.generationMode = generationMode;
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

// ===================== Defines the syntax of C++ below =====================

export type TypeCategory = 'void' | 'null' | 'primitive' | 'string' | 'union' |
                           'array' | 'functor' | 'function' | 'class' |
                           'external' | 'any';
export type TypeModifier = 'optional' | 'external' | 'property' | 'static' |
                           'element' | 'not-function';

export class Type {
  name: string;
  category: TypeCategory;
  types: Type[] = [];
  namespace?: string;
  isOptional = false;
  isProperty = false;
  isStatic = false;
  isExternal = false;
  isElement = false;

  constructor(name: string, category: TypeCategory, modifiers?: TypeModifier[]) {
    this.name = name;
    this.category = category;
    if (modifiers) {
      for (const modifier of modifiers) {
        if (modifier == 'optional')
          this.isOptional = true;
        else if (modifier == 'external')
          this.isExternal = true;
        else if (modifier == 'property')
          this.isProperty = true;
        else if (modifier == 'static')
          this.isStatic = true;
        else if (modifier == 'element')
          this.isElement = true;
        else if (modifier == 'not-function' && this.category == 'function')
          this.category = 'functor';
      }
    }
    if (this.category == 'any' && !this.isExternal)
      throw new Error('The "any" type is not supported');
  }

  print(ctx: PrintContext): string {
    if (this.category == 'function')
      throw new Error('Raw function type should never be printed out');
    if (this.category == 'any')  // could be printed as part of signature name
      return '_Any';
    let cppType = this.name;
    if (this.namespace)
      cppType = `${this.namespace}::${cppType}`;
    if (this.isObject()) {
      if (this.category == 'array')
        cppType = `compilets::Array<${this.getElementType().print(ctx)}>`;
      else if (this.category == 'functor')
        cppType = `compilets::Function<${cppType}>`;
      else if (this.category == 'class')
        cppType = `${cppType}`;
      if (this.isProperty || this.isElement)
        return `cppgc::Member<${cppType}>`;
      else
        return `${cppType}*`;
    }
    if (this.category == 'union') {
      const types = this.types!.map(t => t.print(ctx));
      if (this.isOptional)
        types.push('std::monostate');
      return `std::variant<${types.join(', ')}>`;
    }
    if (this.category == 'null')
      return 'std::nullptr_t';
    if (this.category == 'string')
      cppType = 'compilets::String';
    if (this.isOptional)
      return `std::optional<${cppType}>`;
    return cppType;
  }

  /**
   * Check if this is the same type with `other`.
   *
   * Modifiers static/property/external/element are ignored.
   */
  equal(other: Type): boolean {
    if (this === other)
      return true;
    if (this.name != other.name ||
        this.category != other.category ||
        this.namespace != other.namespace ||
        this.isOptional != other.isOptional)
      return false;
    if (this.category != 'union')
      return true;
    // For unions, also compare all subtypes.
    return this.types.some(t => other.types.some(s => t.equal(s))) &&
           other.types.some(s => this.types.some(t => s.equal(t)));
  }

  /**
   * Check if the type can be assigned with `other` directly in C++.
   */
  assignableWith(other: Type): boolean {
    // Array depends on its element type.
    if (this.category == 'array' && other.category == 'array') {
      return this.getElementType().assignableWith(other.getElementType());
    }
    // Object can always be assigned with null.
    if (this.isObject() && other.category == 'null') {
      return true;
    }
    // Union can be directly assigned with its subtype.
    if (this.category == 'union' && other.category != 'union') {
      return this.types.some(t => t.assignableWith(other));
    }
    // Optional can be assigned with its non-optional type.
    if (this.isStdOptional() && this.noOptional().assignableWith(other)) {
      return true;
    }
    // Optional object can be assigned with non-optional object.
    if (this.isObject() && this.isOptional && this.noOptional().equal(other)) {
      return true;
    }
    // Can not assign object property to the target type directly.
    if (!this.isCppgcMember() && other.isCppgcMember()) {
      return false;
    }
    return this.equal(other);
  }

  /**
   * Create a new instance of Type that is completely the same with this one.
   */
  clone(): Type {
    const newType = new Type(this.name, this.category);
    newType.types = this.types?.map(t => t.clone());
    newType.namespace = this.namespace;
    newType.isOptional = this.isOptional;
    newType.isProperty = this.isProperty;
    newType.isStatic = this.isStatic;
    newType.isExternal = this.isExternal;
    newType.isElement = this.isElement;
    return newType;
  }

  /**
   * Create a new instance of Type that removes the `optional` modifier.
   */
  noOptional() {
    const result = this.clone();
    result.isOptional = false;
    return result;
  }

  /**
   * Helper to get the element type of array.
   *
   * This method does not make code shorter, but make it more readable.
   */
  getElementType() {
    if (this.category != 'array')
      throw new Error('Only array has elementType');
    return this.types[0];
  }

  /**
   * Check the C++ features used in this type and add them to `ctx.features`.
   */
  addFeatures(ctx: PrintContext) {
    if (this.category == 'string') {
      ctx.features.add('string');
    } else if (this.category == 'union') {
      ctx.features.add('union');
    } else if (this.category == 'array') {
      ctx.features.add('array');
    }
    if (this.isStdOptional()) {
      ctx.features.add('optional');
    }
    if (this.namespace == 'compilets') {
      ctx.features.add('runtime');
      if (this.name == 'Console')
        ctx.features.add('console');
      else if (this.name == 'Process')
        ctx.features.add('process');
    }
    for (const type of this.types) {
      type.addFeatures(ctx);
    }
  }

  /**
   * Whether this type inherits from Object.
   */
  isObject() {
    return this.category == 'array' ||
           this.category == 'functor' ||
           this.category == 'class';
  }

  /**
   * Whether this type or the types it contains inherit from Object.
   */
  hasObject() {
    if (this.isObject())
      return true;
    if (this.category == 'union' || this.category == 'array')
      return this.types.some(t => t.isObject());
    return false;
  }

  /**
   * Whether this type is represented by std::optional.
   */
  isStdOptional() {
    return this.category != 'union' && !this.hasObject() && this.isOptional;
  }

  /**
   * Whether this itype is wrapped by cppgc::Member.
   */
  isCppgcMember() {
    return this.isObject() && (this.isProperty || this.isElement);
  }
}

export abstract class Expression {
  type: Type;
  shouldAddParenthesesForPropertyAccess = false;

  constructor(type: Type) {
    this.type = type;
  }

  abstract print(ctx: PrintContext): string;
}

// A special expression where JS text is same with C++ text.
export class RawExpression extends Expression {
  text: string;

  constructor(type: Type, text: string) {
    super(type);
    this.text = text;
  }

  override print(ctx: PrintContext) {
    return this.text;
  }
}

export class NumericLiteral extends RawExpression {
  constructor(text: string) {
    super(new Type('double', 'primitive'), text);
  }
}

export class StringLiteral extends RawExpression {
  constructor(text: string) {
    super(new Type('string', 'string'), 'u' + JSON.stringify(text));
  }
}

export class Identifier extends RawExpression {
  isExternal: boolean;

  constructor(type: Type, text: string, isExternal: boolean) {
    super(type, text);
    this.isExternal = isExternal;
  }

  override print(ctx: PrintContext) {
    if (this.type.namespace && this.isExternal == this.type.isExternal)
      return `${this.type.namespace}::${this.text}`;
    return super.print(ctx);
  }
}

export class StringConcatenation extends Expression {
  spans: Expression[];

  constructor(spans: Expression[]) {
    super(new Type('string', 'string'));
    this.spans = spans;
  }

  override print(ctx: PrintContext) {
    ctx.features.add('string');
    let result = 'compilets::StringBuilder()';
    for (const span of this.spans) {
      result += `.Append(${span.print(ctx)})`;
    }
    result += '.Take()';
    return result;
  }
}

export class AsExpression extends Expression {
  expression: Expression;

  constructor(type: Type, expression: Expression) {
    super(type);
    this.expression = castExpression(expression, type);
  }

  override print(ctx: PrintContext) {
    return this.expression.print(ctx);
  }
}

export class NonNullExpression extends Expression {
  expression: Expression;

  constructor(expression: Expression) {
    if (expression.type.isStdOptional()) {
      super(expression.type.noOptional());
      this.expression = castOptional(expression, this.type, expression.type);
    } else {
      super(expression.type);
      this.expression = expression;
    }
  }

  override print(ctx: PrintContext) {
    return this.expression.print(ctx);
  }
}

export class ParenthesizedExpression extends Expression {
  expression: Expression;

  constructor(expression: Expression) {
    super(expression.type);
    this.expression = expression;
  }

  override print(ctx: PrintContext) {
    return `(${this.expression.print(ctx)})`;
  }
}

export class PostfixUnaryExpression extends Expression {
  operand: Expression;
  operator: string;

  constructor(type: Type, operand: Expression, operator: string) {
    super(type);
    this.operand = operand;
    this.operator = operator;
    this.shouldAddParenthesesForPropertyAccess = true;
  }

  override print(ctx: PrintContext) {
    return `${this.operand.print(ctx)}${this.operator}`;
  }
}

export class PrefixUnaryExpression extends Expression {
  operand: Expression;
  operator: string;

  constructor(type: Type, operand: Expression, operator: string) {
    super(type);
    this.operand = operator == '!' ? ifExpression(operand) : operand;
    this.operator = operator;
    this.shouldAddParenthesesForPropertyAccess = true;
  }

  override print(ctx: PrintContext) {
    return `${this.operator}${this.operand.print(ctx)}`;
  }
}

export class ConditionalExpression extends Expression {
  condition: Expression;
  whenTrue: Expression;
  whenFalse: Expression;

  constructor(type: Type, condition: Expression, whenTrue: Expression, whenFalse: Expression) {
    super(type);
    this.condition = ifExpression(condition);
    this.whenTrue = whenTrue;
    this.whenFalse = whenFalse;
    this.shouldAddParenthesesForPropertyAccess = true;
  }

  override print(ctx: PrintContext) {
    return `${this.condition.print(ctx)} ? ${this.whenTrue.print(ctx)} : ${this.whenFalse.print(ctx)}`;
  }
}

export class BinaryExpression extends Expression {
  left: Expression;
  right: Expression;
  operator: string;

  constructor(type: Type, left: Expression, right: Expression, operator: string) {
    super(type);
    this.left = left;
    this.right = right;
    this.operator = operator;
    this.shouldAddParenthesesForPropertyAccess = true;
    // Assignment requires type conversion.
    if (operator == '=')
      this.right = castExpression(right, left.type);
    // When operating 2 string literals, convert left to string type, because
    // C++ does not allow operator overloading for 2 pointers.
    if (this.left instanceof StringLiteral && this.right instanceof StringLiteral)
      this.left = new ToStringExpression(left);
  }

  override print(ctx: PrintContext) {
    return `${this.left.print(ctx)} ${this.operator} ${this.right.print(ctx)}`;
  }
}

export class ArrayLiteralExpression extends Expression {
  elements: Expression[];

  constructor(type: Type, elements: Expression[]) {
    super(type);
    this.elements = elements;
  }

  override print(ctx: PrintContext) {
    ctx.features.add('array');
    const elementType = this.type.getElementType().print(ctx);
    const elements = this.elements.map(e => e.print(ctx)).join(', ');
    return `compilets::MakeArray<${elementType}>({${elements}})`;
  }
}

export class FunctionExpression extends Expression {
  returnType: Type;
  parameters: ParameterDeclaration[];
  closure: Expression[];
  body?: Block;

  constructor(type: Type,
              returnType: Type,
              parameters: ParameterDeclaration[],
              closure: Expression[],
              body?: Block) {
    super(type);
    this.returnType = returnType;
    this.parameters = parameters;
    this.closure = closure.map(expr => {
      if (expr.type.isObject())
        return expr;
      if (expr.type.category == 'union') {
        // Get the pointer to GCed object from union.
        return new CustomExpression(new Type('Object', 'class'), (ctx) => {
          return `compilets::GetObject(${expr.print(ctx)})`;
        });
      }
      throw new Error(`Can not store type "${expr.type.name}" as closure`);
    });
    this.body = body;
    this.shouldAddParenthesesForPropertyAccess = true;
  }

  override print(ctx: PrintContext) {
    ctx.features.add('function');
    this.parameters.forEach(p => p.type.addFeatures(ctx));
    const returnType = this.returnType.print(ctx);
    const fullParameters = ParameterDeclaration.printParameters(ctx, this.parameters);
    const shortParameters = this.parameters.map(p => p.type.print(ctx)).join(', ');
    const body = this.body?.print(ctx) ?? '{}';
    const lambda = `[=](${fullParameters}) -> ${returnType} ${body}`;
    const closure = this.closure.map(c => c.print(ctx));
    return `compilets::MakeFunction<${returnType}(${shortParameters})>(${[ lambda, ...closure ].join(', ')})`;
  }
}

// Represent the arguments of a call-like expression.
export class CallArguments {
  args: Expression[];

  constructor(args: Expression[], parameters: ParameterDeclaration[]) {
    this.args = castArguments(args, parameters);
  }

  print(ctx: PrintContext) {
    return this.args.map(a => a.print(ctx)).join(', ');
  }
}

export class CallExpression extends Expression {
  callee: Expression;
  args: CallArguments;

  constructor(type: Type, callee: Expression, args: CallArguments) {
    super(type);
    this.callee = callee;
    this.args = args;
  }

  override print(ctx: PrintContext) {
    this.callee.type.addFeatures(ctx);
    let callee = printExpressionValue(this.callee, ctx);
    if (this.callee.type.category == 'functor' && !this.callee.type.isExternal)
      callee = `${callee}->value()`;
    return `${callee}(${this.args.print(ctx)})`;
  }
}

export class NewExpression extends Expression {
  args: CallArguments;

  constructor(type: Type, args: CallArguments) {
    super(type);
    this.args = args;
  }

  override print(ctx: PrintContext) {
    const args = this.args.print(ctx);
    if (this.type.isObject())
      return `compilets::MakeObject<${this.type.name}>(${args})`;
    else
      return `new ${this.type.name}(${args})`;
  }
}

// Converts the expression to string.
export class ToStringExpression extends Expression {
  expression: Expression;

  constructor(expression: Expression) {
    super(new Type('string', 'string'));
    this.expression = expression;
  }

  override print(ctx: PrintContext) {
    ctx.features.add('string');
    return `compilets::String(${this.expression.print(ctx)})`;
  }
}

export class PropertyAccessExpression extends Expression {
  expression: Expression;
  member: string;

  constructor(type: Type, expression: Expression, member: string) {
    super(type);
    if (expression instanceof StringLiteral)
      this.expression = new ToStringExpression(expression);
    else
      this.expression = castExpression(expression, expression.type);
    this.member = member;
  }

  override print(ctx: PrintContext) {
    this.expression.type.addFeatures(ctx);
    let dot: string;
    if (this.expression.type.isObject()) {
      if (this.type.isStatic)
        dot = '::';
      else
        dot = '->';
    } else {
      dot = '.';
    }
    return this.expression.print(ctx) + dot + this.member;
  }
}

export class ElementAccessExpression extends Expression {
  expression: Expression;
  arg: Expression;

  constructor(type: Type, expression: Expression, arg: Expression) {
    super(type);
    if (expression instanceof StringLiteral)
      this.expression = new ToStringExpression(expression);
    else
      this.expression = castExpression(expression, expression.type);
    this.arg = castExpression(arg, new Type('size_t', 'primitive'));
  }

  override print(ctx: PrintContext) {
    const accessor = this.expression.type.category == 'array' ? '->value()' : '';
    return `${printExpressionValue(this.expression, ctx)}${accessor}[${this.arg.print(ctx)}]`;
  }
}

/**
 * Custom expression that accepts custom print function.
 */
export class CustomExpression extends Expression {
  customPrint: (ctx: PrintContext) => string;

  constructor(type: Type, customPrint: (ctx: PrintContext) => string) {
    super(type);
    this.customPrint = customPrint;
  }

  override print(ctx: PrintContext) {
    return this.customPrint(ctx);
  }
}

export abstract class Declaration {
  abstract print(ctx: PrintContext): string;
}

export class VariableDeclaration extends Declaration {
  identifier: string;
  type: Type;
  initializer?: Expression;

  constructor(identifier: string, type: Type, initializer?: Expression) {
    super();
    this.identifier = identifier;
    this.type = type;
    if (initializer) {
      // Make sure initializer is casted to the variable type.
      this.initializer = castExpression(initializer, type);
    } else if (type.isObject()) {
      // Make sure pointers are initialized to nullptr.
      this.initializer = new RawExpression(new Type('nullptr', 'null'), 'nullptr');
    }
  }

  override print(ctx: PrintContext) {
    this.type.addFeatures(ctx);
    if (this.initializer)
      return `${this.identifier} = ${this.initializer.print(ctx)}`;
    else
      return this.identifier;
  }
}

export class VariableDeclarationList extends Declaration {
  declarations: VariableDeclaration[];

  constructor(decls: VariableDeclaration[]) {
    super();
    this.declarations = decls;
  }

  override print(ctx: PrintContext) {
    const type = this.declarations[0].type.print(ctx);
    return `${type} ${this.declarations.map(d => d.print(ctx)).join(', ')}`;
  }
}

export abstract class NamedDeclaration extends Declaration {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }
}

export class ParameterDeclaration extends NamedDeclaration {
  type: Type;
  variadic: boolean;
  initializer?: Expression;

  constructor(name: string, type: Type, variadic = false, initializer?: Expression) {
    super(name);
    this.type = type;
    this.variadic = variadic;
    if (initializer)
      this.initializer = castExpression(initializer, type);
  }

  override print(ctx: PrintContext) {
    let result = `${this.type.print(ctx)} ${this.name}`;
    if (this.initializer)
      result += ` = ${this.initializer.print(ctx)}`;
    return result;
  }

  static printParameters(ctx: PrintContext, parameters: ParameterDeclaration[]) {
    if (parameters.length > 0)
      return parameters.map(p => p.print(ctx)).join(', ');
    else
      return '';
  }
}

export abstract class ClassElement extends NamedDeclaration {
  modifiers: string[];
  parent?: ClassDeclaration;

  constructor(name: string, modifiers?: string[]) {
    super(name);
    this.modifiers = modifiers ?? [];
  }
}

export class SemicolonClassElement extends ClassElement {
  constructor() {
    super(';');
  }

  override print(ctx: PrintContext) {
    return '';
  }
}

export class ConstructorDeclaration extends ClassElement {
  parameters: ParameterDeclaration[];
  body?: Block;

  constructor(name: string, parameters: ParameterDeclaration[], body?: Block) {
    super(name);
    this.parameters = parameters;
    this.body = body;
  }

  override print(ctx: PrintContext) {
    const parameters = ParameterDeclaration.printParameters(ctx, this.parameters);
    const body = this.body?.print(ctx) ?? '= default;';
    return `${ctx.prefix}${this.name}(${parameters}) ${body}`;
  }
}

export class DestructorDeclaration extends ClassElement {
  body?: Block;

  constructor(name: string, modifiers?: string[], body?: Block) {
    super(name, modifiers);
    this.body = body;
  }

  override print(ctx: PrintContext) {
    let result = ctx.prefix;
    if (this.modifiers.includes('virtual'))
      result += 'virtual ';
    result += `~${this.name}() `;
    result += this.body?.print(ctx) ?? '= default;';
    return result;
  }
}

export class PropertyDeclaration extends ClassElement {
  type: Type;
  initializer?: Expression;

  constructor(name: string, modifiers: string[], type: Type, initializer?: Expression) {
    super(name, modifiers);
    this.type = type;
    if (initializer)
      this.initializer = castExpression(initializer, type);
  }

  override print(ctx: PrintContext) {
    this.type.addFeatures(ctx);
    const isStatic = this.modifiers.includes('static');
    let result = ctx.prefix;
    if (isStatic)
      result += 'static ';
    result += `${this.type.print(ctx)} ${this.name}`;
    if (this.initializer && !isStatic)
      result += ` = ${this.initializer.print(ctx)}`;
    return result + ';';
  }
}

export class MethodDeclaration extends ClassElement {
  returnType: Type;
  parameters: ParameterDeclaration[];
  body?: Block;

  constructor(name: string, modifiers: string[], returnType: Type, parameters: ParameterDeclaration[], body?: Block) {
    super(name, modifiers);
    this.returnType = returnType;
    this.parameters = parameters;
    this.body = body;
  }

  override print(ctx: PrintContext) {
    this.parameters.forEach(p => p.type.addFeatures(ctx));
    let result = ctx.prefix;
    if (this.modifiers.includes('virtual'))
      result += 'virtual ';
    result += `${this.returnType.print(ctx)} ${this.name}(`;
    result += ParameterDeclaration.printParameters(ctx, this.parameters);
    result += ') ';
    if (this.modifiers.includes('const'))
      result += 'const ';
    if (this.modifiers.includes('override'))
      result += 'override ';
    result += this.body?.print(ctx) ?? '{}';
    return result;
  }
}

export abstract class Statement {
  abstract print(ctx: PrintContext): string;
}

export abstract class DeclarationStatement extends Statement {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }
}

export class ClassDeclaration extends DeclarationStatement {
  type: Type;
  publicMembers: ClassElement[] = [];
  protectedMembers: ClassElement[] = [];
  privateMembers: ClassElement[] = [];
  destructor?: ClassElement;

  constructor(type: Type, members: ClassElement[]) {
    super(type.name);
    this.type = type;
    for (const member of members) {
      if (member.modifiers.includes('private'))
        this.privateMembers.push(member);
      else if (member.modifiers.includes('protected'))
        this.protectedMembers.push(member);
      else
        this.publicMembers.push(member);
    }
    if (this.type.hasObject()) {
      // Add Trace method if it includes cppgc::Member.
      const trace = createTraceMethod(members);
      if (trace)
        this.publicMembers.push(trace);
      // Add a virtual destructor if the class is not trivially destrutible.
      if (members.find(m => m instanceof PropertyDeclaration))
        this.publicMembers.push(new DestructorDeclaration(this.name, [ 'virtual' ]));
      // Add pre finalizer if a method is marked as destructor.
      this.destructor = members.find(m => m instanceof MethodDeclaration && m.modifiers.includes('destructor'));
    }
  }

  override print(ctx: PrintContext) {
    ctx.features.add('object');
    return printClassDeclaration(this, ctx);
  }

  getMembers(): ClassElement[] {
    return [ ...this.publicMembers, ...this.protectedMembers, ...this.privateMembers ];
  }
}

export class FunctionDeclaration extends DeclarationStatement {
  returnType: Type;
  parameters: ParameterDeclaration[];
  body?: Block;

  constructor(name: string, returnType: Type, parameters: ParameterDeclaration[], body?: Block) {
    super(name);
    this.returnType = returnType;
    this.parameters = parameters;
    this.body = body;
  }

  override print(ctx: PrintContext) {
    this.parameters.forEach(p => p.type.addFeatures(ctx));
    const returnType = this.returnType.print(ctx);
    const parameters = ParameterDeclaration.printParameters(ctx, this.parameters);
    if (ctx.mode == 'forward')
      return `${returnType} ${this.name}(${parameters});`;
    const body = this.body?.print(ctx) ?? '{}';
    return `${returnType} ${this.name}(${parameters}) ${body}\n`;
  }
}

// A special declaration for putting the top-level statements of the entry
// script into the "main" function.
export class MainFunction extends DeclarationStatement {
  body: Block = new Block();

  constructor() {
    super('main');
  }

  override print(ctx: PrintContext) {
    let signature: string;
    let body: Block;
    if (ctx.generationMode == 'exe') {
      signature = 'int main(int, const char*[])';
      body = new Block([
        new ExpressionStatement(new RawExpression(new Type('compilets::State', 'external'),
                                                  'compilets::State state')),
        ...this.body.statements,
        new ReturnStatement(new RawExpression(new Type('int', 'primitive'), '0')),
      ]);
    } else {
      signature = 'void Main()';
      body = this.body;
    }
    return `${ctx.prefix}${signature} ${body.print(ctx)}`;
  }

  isEmpty() {
    return this.body.statements.length == 0;
  }
}

// Multiple statements without {}, this is used for convenient internal
// implementations where one JS statement maps to multiple C++ ones.
export class Paragraph<T extends Statement> extends Statement {
  statements: T[];

  constructor(statements?: T[]) {
    super();
    this.statements = statements ?? [];
  }

  override print(ctx: PrintContext) {
    return this.statements.map(s => s.print(ctx)).join('\n');
  }
}

export class Block extends Paragraph<Statement> {
  override print(ctx: PrintContext) {
    if (this.statements?.length > 0) {
      ctx.level++;
      ctx.concatenateNextLine = false;
      let result = `{\n${super.print(ctx)}`;
      ctx.level--;
      result += `\n${ctx.padding}}`;
      return result;
    } else {
      return '{}';
    }
  }
}

export class VariableStatement extends Statement {
  declarationList: VariableDeclarationList;

  constructor(list: VariableDeclarationList) {
    super();
    this.declarationList = list;
  }

  override print(ctx: PrintContext) {
    return `${ctx.prefix}${this.declarationList.print(ctx)};`;
  }
}

export class ExpressionStatement extends Statement {
  expression: Expression;

  constructor(expr: Expression) {
    super();
    this.expression = expr;
  }

  override print(ctx: PrintContext) {
    return `${ctx.prefix}${this.expression.print(ctx)};`;
  }
}

export class IfStatement extends Statement {
  expression: Expression;
  thenStatement: Statement;
  elseStatement?: Statement;

  constructor(expression: Expression, thenStatement: Statement, elseStatement?: Statement) {
    super();
    this.expression = ifExpression(expression);
    this.thenStatement = thenStatement;
    this.elseStatement = elseStatement;
  }

  override print(ctx: PrintContext) {
    let result = `${ctx.prefix}if (${this.expression.print(ctx)}) ${this.thenStatement.print(ctx.join())}`;
    if (this.elseStatement)
      result += ` else ${this.elseStatement.print(ctx.join())}`;
    return result;
  }
}

export class DoStatement extends Statement {
  statement: Statement;
  expression: Expression;

  constructor(statement: Statement, expression: Expression) {
    super();
    this.statement = statement;
    this.expression = ifExpression(expression);
  }

  override print(ctx: PrintContext) {
    return `${ctx.prefix}do ${this.statement.print(ctx)} while (${this.expression.print(ctx)});`;
  }
}

export class WhileStatement extends Statement {
  statement: Statement;
  expression: Expression;

  constructor(statement: Statement, expression: Expression) {
    super();
    this.statement = statement;
    this.expression = ifExpression(expression);
  }

  override print(ctx: PrintContext) {
    return `${ctx.prefix}while (${this.expression.print(ctx)}) ${this.statement.print(ctx)}`;
  }
}

export class ForStatement extends Statement {
  statement: Statement;
  initializer?: VariableDeclarationList | Expression;
  condition?: Expression;
  incrementor?: Expression;

  constructor(statement: Statement,
              initializer?: VariableDeclarationList | Expression,
              condition?: Expression,
              incrementor?: Expression) {
    super();
    this.statement = statement;
    this.initializer = initializer;
    if (condition)
      this.condition = ifExpression(condition);
    this.incrementor = incrementor;
  }

  override print(ctx: PrintContext) {
    return `${ctx.prefix}for (${this.initializer?.print(ctx) ?? ''}; ${this.condition?.print(ctx) ?? ''}; ${this.incrementor?.print(ctx) ?? ''}) ${this.statement.print(ctx)}`;
  }
}

export class ReturnStatement extends Statement {
  expression?: Expression;

  constructor(expression?: Expression, target?: Type) {
    super();
    if (expression)
      this.expression = castExpression(expression, target ?? expression.type);
  }

  override print(ctx: PrintContext) {
    if (this.expression)
      return `${ctx.prefix}return ${this.expression.print(ctx)};`;
    else
      return `${ctx.prefix}return;`;
  }
}

export type IncludeStatementType = 'angle-bracket' | 'quoted';

export class IncludeStatement extends Statement {
  type: IncludeStatementType;
  path: string;

  constructor(type: IncludeStatementType, path: string) {
    super();
    this.type = type;
    this.path = path;
  }

  override print(ctx: PrintContext) {
    if (this.type == 'angle-bracket')
      return `#include <${this.path}>\n`;
    else
      return `#include "${this.path}"\n`;
  }
}

export class Headers extends Statement {
  c: IncludeStatement[] = [];
  stl: IncludeStatement[] = [];
  files: IncludeStatement[] = [];

  override print(ctx: PrintContext) {
    let results: string[] = [];
    if (this.c.length > 0)
      results.push(this.c.map(h => h.print(ctx)).sort().join(''));
    if (this.stl.length > 0)
      results.push(this.stl.map(h => h.print(ctx)).sort().join(''));
    if (this.files.length > 0)
      results.push(this.files.map(h => h.print(ctx)).sort().join(''));
    return results.map(h => h + '\n').join('');
  }
}
