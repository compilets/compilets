import {
  PrintContext,
  Type,
  FunctionType,
  InterfaceType,
} from './cpp-syntax-type';
import {
  notTriviallyDestructible,
  createTraceMethod,
  printClassDeclaration,
  printExpressionValue,
  printTemplateArguments,
  printTemplateDeclaration,
  printTypeName,
  castExpression,
  castArguments,
  castOptional,
} from './cpp-syntax-utils';

export * from './cpp-syntax-type';

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
    super(Type.createNumberType(), text);
  }
}

export class StringLiteral extends RawExpression {
  constructor(text: string) {
    super(Type.createStringType(), 'u' + JSON.stringify(text));
  }
}

export class NullKeyword extends RawExpression {
  constructor() {
    super(new Type('null', 'null'), 'nullptr');
  }
}

export class Identifier extends RawExpression {
  // Whether the identifier itself comes from external .d.ts file.
  isExternal: boolean;

  constructor(type: Type, text: string, isExternal: boolean) {
    super(type, text);
    this.isExternal = isExternal;
  }

  override print(ctx: PrintContext) {
    // Add namespace prefix.
    if (this.type.namespace && this.isExternal && this.type.isExternal)
      return `${this.type.namespace}::${this.text}`;
    // Add template arguments for function call.
    if (this.type.category == 'function' && this.type.templateArguments)
      return this.text + printTemplateArguments(this.type.templateArguments);
    return this.text;
  }
}

export class StringConcatenation extends Expression {
  spans: Expression[];

  constructor(spans: Expression[]) {
    super(Type.createStringType());
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

export class ExpressionWithTemplateArguments extends Expression {
  expression: Expression;
  templateArguments?: Type[];

  constructor(type: Type, expression: Expression, templateArguments?: Type[]) {
    super(type);
    this.expression = expression;
    this.templateArguments = templateArguments;
  }

  override print(ctx: PrintContext) {
    return this.expression.print(ctx) + printTemplateArguments(this.templateArguments);
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
    this.operand = operator == '!' ? new Condition(operand) : operand;
    this.operator = operator;
    this.shouldAddParenthesesForPropertyAccess = true;
  }

  override print(ctx: PrintContext) {
    return `${this.operator}${this.operand.print(ctx)}`;
  }
}

export class Condition extends Expression {
  condition: Expression;

  constructor(condition: Expression) {
    super(Type.createBooleanType());
    this.condition = condition;
  }

  override print(ctx: PrintContext) {
    const {type} = this.condition;
    if (type.isObject() || (type.category == 'primitive' && !type.isOptional))
      return this.condition.print(ctx);
    ctx.features.add('type-traits');
    return `compilets::IsTrue(${this.condition.print(ctx)})`;
  }
}

export class ConditionalExpression extends Expression {
  condition: Expression;
  whenTrue: Expression;
  whenFalse: Expression;

  constructor(type: Type, condition: Expression, whenTrue: Expression, whenFalse: Expression) {
    super(type);
    this.condition = new Condition(condition);
    this.whenTrue = whenTrue;
    this.whenFalse = whenFalse;
    this.shouldAddParenthesesForPropertyAccess = true;
  }

  override print(ctx: PrintContext) {
    return `${this.condition.print(ctx)} ? ${this.whenTrue.print(ctx)} : ${this.whenFalse.print(ctx)}`;
  }
}

export class ComparisonExpression extends Expression {
  left: Expression;
  right: Expression;
  operator: string;

  constructor(left: Expression, right: Expression, operator: string) {
    super(Type.createBooleanType());
    this.left = left;
    this.right = right;
    this.operator = operator;
    if (this.left instanceof StringLiteral && this.right instanceof StringLiteral) {
      // When operating 2 string literals, convert left to string type, because
      // C++ does not allow operator overloading for 2 pointers.
      this.left = new ToStringExpression(left);
    } else if (this.left instanceof StringLiteral && this.right.type.category != 'string') {
      // Similarly do conversion when comparing literal with non-strings.
      this.left = new ToStringExpression(left);
    } else if (this.right instanceof StringLiteral && this.left.type.category != 'string') {
      // And comparing non-strings with literals.
      this.right = new ToStringExpression(right);
    }
  }

  override print(ctx: PrintContext) {
    if (this.left.type.category == 'string' || this.right.type.category == 'string')
      ctx.features.add('string');
    const left = this.left.print(ctx);
    const right = this.right.print(ctx);
    if (this.left.type.category == 'primitive' &&
        this.right.type.category == 'primitive') {
      // Use plain old comparisons when comparing primitives types.
      switch (this.operator) {
        case '===':
          return `${left} == ${right}`;
        case '!==':
          return `${left} != ${right}`;
        default:
          return `${left} ${this.operator} ${right}`;
      }
    } else {
      // Use helpers when comparing with custom types.
      switch (this.operator) {
        case '===':
          return `compilets::StrictEqual(${left}, ${right})`;
        case '!==':
          return `!compilets::StrictEqual(${left}, ${right})`;
        case '==':
          return `compilets::Equal(${left}, ${right})`;
        case '!=':
          return `!compilets::Equal(${left}, ${right})`;
        default:
          return `${left} ${this.operator} ${right}`;
      }
    }
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

  constructor(type: FunctionType,
              parameters: ParameterDeclaration[],
              closure: Expression[],
              body?: Block) {
    super(type);
    this.returnType = type.returnType;
    this.parameters = parameters;
    this.closure = closure.map(expr => {
      if (expr.type.isObject())
        return expr;
      if (expr.type.category == 'union') {
        // Get the pointer to GCed object from union.
        return new CustomExpression(new Type('Object', 'class'), (ctx) => {
          return `${printExpressionValue(expr, ctx)}.GetObject()`;
        });
      }
      throw new Error(`Can not store type "${expr.type.name}" as closure`);
    });
    this.body = body;
    this.shouldAddParenthesesForPropertyAccess = true;
  }

  override print(ctx: PrintContext) {
    ctx.features.add('function');
    this.returnType.addFeatures(ctx);
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

  constructor(args: Expression[], parameters: Type[]) {
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
    if (this.callee.type.category == 'functor')
      callee = `${callee}->value()`;
    return `${callee}(${this.args.print(ctx)})`;
  }
}

export class MethodCallExpression extends CallExpression {
  constructor(type: Type, callee: PropertyAccessExpression, args: CallArguments) {
    super(type, callee, args);
  }

  override print(ctx: PrintContext) {
    const {expression, member} = this.callee as PropertyAccessExpression;
    if (expression.type.isObject() || expression.type.category == 'string')
      return super.print(ctx);
    if (expression.type.category == 'union') {
      // Accessing union's method with std::visit.
      const returnType = (this.callee.type as FunctionType).returnType.print(ctx);
      return `std::visit([&](auto&& obj) -> ${returnType} { return obj->${member}(${this.args.print(ctx)}); }, ${expression.print(ctx)})`;
    }
    throw new Error(`Unable to print method call for unsupported type ${expression.type.name}`);
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
      return `compilets::MakeObject<${printTypeName(this.type)}>(${args})`;
    else
      return `new ${printTypeName(this.type)}(${args})`;
  }
}

export class ObjectLiteral extends NewExpression {
  constructor(type: InterfaceType, initializers: Map<string, Expression>) {
    const args = Array.from(type.properties.keys(), (name) => initializers.get(name) ?? new NullKeyword());
    const parameters = Array.from(type.properties.values());
    super(type, new CallArguments(args, parameters));
  }
}

// Converts the expression to string.
export class ToStringExpression extends Expression {
  expression: Expression;

  constructor(expression: Expression) {
    super(Type.createStringType());
    this.expression = expression;
  }

  override print(ctx: PrintContext) {
    ctx.features.add('string');
    return `compilets::String(${this.expression.print(ctx)})`;
  }
}

export class BaseResolutionExpression extends Expression {
  classType: Type;

  constructor(classType: Type) {
    super(new Type(classType.name, 'super'));
    this.classType = classType;
  }

  override print(ctx: PrintContext) {
    return this.classType.name + '::';
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
      this.expression = expression;
    this.member = member;
  }

  override print(ctx: PrintContext) {
    // Accessing a type's property means we must know the type's declaration.
    const {type} = this.expression;
    type.addFeatures(ctx);
    // Accessing union's property requires using std::visit.
    if (type.category == 'union') {
      const expression = this.expression.print(ctx);
      const returnType = this.type.print(ctx);
      return `std::visit([](auto&& obj) -> ${returnType} { return obj->${this.member}; }, ${expression})`;
    }
    // For other types things fallback to usual C++ property access.
    let dot: string;
    if (type.category == 'super') {
      dot = '';
    } else if (type.isObject()) {
      if (this.type.isStatic)
        dot = '::';
      else
        dot = '->';
    } else {
      dot = '.';
    }
    return printExpressionValue(this.expression, ctx) + dot + this.member;
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
    if (type.category == 'method')
      throw new Error('Can not store method as function object');
    if (initializer) {
      // Make sure initializer is casted to the variable type.
      this.initializer = castExpression(initializer, type);
    } else if (type.isObject() ||
               (type.category == 'union' && type.isOptional)) {
      // Make sure pointers and unions are initialized to nullptr.
      this.initializer = castExpression(new NullKeyword(), type);
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
  initializer?: Expression;

  constructor(name: string, type: Type, initializer?: Expression) {
    super(name);
    this.type = type;
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
  classDeclaration?: ClassDeclaration;

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
  baseCall?: CallArguments;
  initializerList?: string[];

  constructor(name: string, parameters: ParameterDeclaration[], body?: Block, baseCall?: CallArguments) {
    super(name);
    this.parameters = parameters;
    this.body = body;
    this.baseCall = baseCall;
  }

  override print(ctx: PrintContext) {
    let body: string;
    if (this.body)
      body = this.body?.print(ctx);
    else if (this.initializerList)
      body = `: ${this.initializerList.join(', ')} {}`;
    else
      body = '= default;';
    const parameters = ParameterDeclaration.printParameters(ctx, this.parameters);
    const baseType = this.classDeclaration?.type.base?.name;
    if (!baseType && this.baseCall)
      throw new Error(`There is no base class for "${this.name}" but super is called`);
    const baseCall = this.baseCall ? ` : ${baseType}(${this.baseCall.print(ctx)})` : '';
    return `${ctx.prefix}${this.name}(${parameters})${baseCall} ${body}`;
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
  type: FunctionType;
  parameters: ParameterDeclaration[];
  body?: Block;

  constructor(type: FunctionType, name: string, modifiers: string[], parameters: ParameterDeclaration[], body?: Block) {
    super(name, modifiers);
    this.type = type;
    this.parameters = parameters;
    this.body = body;
  }

  override print(ctx: PrintContext) {
    this.type.returnType.addFeatures(ctx);
    this.parameters.forEach(p => p.type.addFeatures(ctx));
    let result = ctx.prefix;
    if (this.modifiers.includes('virtual'))
      result += 'virtual ';
    result += `${this.type.returnType.print(ctx)} ${this.name}(`;
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
  isExported: boolean;

  constructor(name: string, isExported = false) {
    super();
    this.name = name;
    this.isExported = isExported;
  }
}

export class ClassDeclaration extends DeclarationStatement {
  type: Type;
  publicMembers: ClassElement[] = [];
  protectedMembers: ClassElement[] = [];
  privateMembers: ClassElement[] = [];
  destructor?: ClassElement;

  constructor(type: Type, isExported: boolean, members: ClassElement[]) {
    super(type.name, isExported);
    this.type = type;
    for (const member of members) {
      if (member.modifiers.includes('private'))
        this.privateMembers.push(member);
      else if (member.modifiers.includes('protected'))
        this.protectedMembers.push(member);
      else
        this.publicMembers.push(member);
    }
    if (notTriviallyDestructible(members)) {
      // Add Trace method.
      const trace = createTraceMethod(this.type, members);
      if (trace)
        this.publicMembers.push(trace);
      // Add a virtual destructor.
      this.publicMembers.push(new DestructorDeclaration(this.name, [ 'virtual' ]));
    }
    // Add pre finalizer if a method is marked as destructor.
    this.destructor = members.find(m => m instanceof MethodDeclaration && m.modifiers.includes('destructor'));
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
  type: FunctionType;
  parameters: ParameterDeclaration[];
  body?: Block;

  constructor(type: FunctionType,
              isExported: boolean,
              name: string,
              parameters: ParameterDeclaration[],
              body?: Block) {
    super(name, isExported);
    this.type = type;
    this.parameters = parameters;
    this.body = body;
  }

  override print(ctx: PrintContext) {
    this.type.returnType.addFeatures(ctx);
    this.parameters.forEach(p => p.type.addFeatures(ctx));
    const templateDeclaration = printTemplateDeclaration(this.type);
    const returnType = this.type.returnType.print(ctx);
    const parameters = ParameterDeclaration.printParameters(ctx, this.parameters);
    let result = `${returnType} ${this.name}(${parameters})`;
    if (ctx.mode == 'forward') {
      result += ';';
    } else {
      const body = this.body?.print(ctx) ?? '{}';
      result += ` ${body}\n`;
    }
    if (templateDeclaration)
      return templateDeclaration + '\n' + result;
    return result;
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
    this.expression = new Condition(expression);
    this.thenStatement = thenStatement;
    this.elseStatement = elseStatement;
  }

  override print(ctx: PrintContext) {
    let result = `${ctx.prefix}if (${this.expression.print(ctx)}) ${this.thenStatement.print(ctx.join())}`;
    if (this.elseStatement)
      result += ` else ${this.elseStatement.print(ctx.join())}`;
    ctx.concatenateNextLine = false;
    return result;
  }
}

export class DoStatement extends Statement {
  statement: Statement;
  expression: Expression;

  constructor(statement: Statement, expression: Expression) {
    super();
    this.statement = statement;
    this.expression = new Condition(expression);
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
    this.expression = new Condition(expression);
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
      this.condition = new Condition(condition);
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

  addLocalHeader(path: string) {
    this.files.push(new IncludeStatement('quoted', path));
  }

  override print(ctx: PrintContext) {
    let results: string[] = [];
    if (this.c.length > 0)
      results.push(this.c.map(h => h.print(ctx)).sort().join(''));
    if (this.stl.length > 0)
      results.push(this.stl.map(h => h.print(ctx)).sort().join(''));
    if (this.files.length > 0)
      results.push(this.files.map(h => h.print(ctx)).sort().join(''));
    return results.join('\n');
  }
}
