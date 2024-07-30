import {createTraceMethod} from './cpp-syntax-utils';

/**
 * Possible modes for generating the project.
 */
export type GenerationMode = 'lib' | 'exe' | 'napi';

/**
 * Possible modes for printing the syntax node.
 */
export type PrintMode = 'impl' | 'header' | 'forward';

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

  join() {
    this.concatenateNextLine = true;
    return this;
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
}

/**
 * Optional C++ features used in the code.
 */
export type Feature = 'optional' | 'class' | 'functor';

/**
 * Extra options for printing type.
 */
export type TypeModifier = 'gced-class-property';

// ===================== Defines the syntax of C++ below =====================

export type TypeCategory = 'void' |
                           'primitive' |
                           'string' |
                           'function' |
                           'functor' |
                           'raw-class' | 'stack-class' | 'gced-class';

export class Type {
  name: string;
  category: TypeCategory;
  optional: boolean;

  constructor(name: string, category: TypeCategory, optional = false) {
    this.name = name;
    this.category = category;
    this.optional = optional;
  }

  print(ctx: PrintContext, modifiers?: TypeModifier[]) {
    if (this.category == 'function')  // we should never print this
      return `<internal-function-type><${this.name}>`;
    if (this.category == 'functor')
      return `compilets::Function<${this.name}>*`;
    const isGCedClassProperty = modifiers?.includes('gced-class-property');
    if (this.isClass()) {
      if (isGCedClassProperty && this.isGCedType())
        return `cppgc::Member<${this.name}>`;
      else
        return `${this.name}*`;
    }
    let valueType = this.name;
    if (this.category == 'string')
      valueType = 'std::string';
    if (this.optional)
      return `std::optional<${valueType}>`;
    return valueType;
  }

  equal(other: Type) {
    return this.name == other.name && this.category == other.category;
  }

  isClass() {
    return this.category == 'raw-class' ||
           this.category == 'stack-class' ||
           this.category == 'gced-class';
  }

  isGCedType() {
    return this.category == 'functor' || this.category == 'gced-class';
  }
}

export abstract class Expression {
  hand?: 'left' | 'right';

  abstract print(ctx: PrintContext): string;
}

export abstract class Declaration {
  abstract print(ctx: PrintContext): string;
}

export abstract class Statement {
  abstract print(ctx: PrintContext): string;
}

// A special expression where JS text is same with C++ text.
export class RawExpression extends Expression {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  override print(ctx: PrintContext) {
    return this.text;
  }
}

export class StringLiteral extends RawExpression {
  constructor(text: string) {
    super(`"${text}"`);
  }
}

export class ParenthesizedExpression extends Expression {
  expression: Expression;

  constructor(expr: Expression) {
    super();
    this.expression = expr;
  }

  override print(ctx: PrintContext) {
    return `(${this.expression.print(ctx)})`;
  }
}

export class PostfixUnaryExpression extends Expression {
  operand: Expression;
  operator: string;

  constructor(operand: Expression, operator: string) {
    super();
    this.operand = operand;
    this.operator = operator;
  }

  override print(ctx: PrintContext) {
    return `${this.operand.print(ctx)}${this.operator}`;
  }
}

export class PrefixUnaryExpression extends Expression {
  operand: Expression;
  operator: string;

  constructor(operand: Expression, operator: string) {
    super();
    this.operand = operand;
    this.operator = operator;
  }

  override print(ctx: PrintContext) {
    return `${this.operator}${this.operand.print(ctx)}`;
  }
}

export class BinaryExpression extends Expression {
  left: Expression;
  right: Expression;
  operator: string;

  constructor(left: Expression, right: Expression, operator: string) {
    super();
    this.left = left;
    this.left.hand = 'left';
    this.right = right;
    this.right.hand = 'right';
    this.operator = operator;
  }

  override print(ctx: PrintContext) {
    return `${this.left.print(ctx)} ${this.operator} ${this.right.print(ctx)}`;
  }
}

export class ConditionalExpression extends Expression {
  condition: Expression;
  whenTrue: Expression;
  whenFalse: Expression;

  constructor(condition: Expression, whenTrue: Expression, whenFalse: Expression) {
    super();
    this.condition = condition;
    this.whenTrue = whenTrue;
    this.whenFalse = whenFalse;
  }

  override print(ctx: PrintContext) {
    return `${this.condition.print(ctx)} ? ${this.whenTrue.print(ctx)} : ${this.whenFalse.print(ctx)}`;
  }
}

export class FunctionExpression extends Expression {
  returnType: Type;
  parameters: ParameterDeclaration[];
  body?: Block;

  constructor(returnType: Type, parameters: ParameterDeclaration[], body?: Block) {
    super();
    this.returnType = returnType;
    this.parameters = parameters;
    this.body = body;
  }

  override print(ctx: PrintContext) {
    const returnType = this.returnType.print(ctx);
    const parameters = ParameterDeclaration.printParameters(ctx, this.parameters);
    const body = this.body?.print(ctx) ?? '{}';
    const lambda = `[=](${parameters}) -> ${returnType} ${body}`;
    return `compilets::MakeFunction(${lambda})`;
  }
}

export class CallExpression extends Expression {
  callee: Expression;
  calleeType: Type;
  args: Expression[];

  constructor(callee: Expression, calleeType: Type, args: Expression[]) {
    super();
    this.callee = callee;
    this.calleeType = calleeType;
    this.args = args;
  }

  override print(ctx: PrintContext) {
    let callee = this.callee.print(ctx);
    if (this.calleeType.category == 'functor')
      callee = `(*${callee})`;
    const args = this.args.map(a => a.print(ctx)).join(', ');
    return `${callee}(${args})`;
  }
}

export class NewExpression extends Expression {
  type: Type;
  args: Expression[];

  constructor(type: Type, args: Expression[]) {
    super();
    this.type = type;
    this.args = args;
  }

  override print(ctx: PrintContext) {
    const args = this.args.map(a => a.print(ctx))
    if (this.type.isGCedType()) {
      args.unshift('compilets::GetAllocationHandle()');
      return `cppgc::MakeGarbageCollected<${this.type.name}>(${args.join(', ')})`;
    } else {
      return `new ${this.type.name}(${args.join(', ')})`;
    }
  }
}

export class PropertyAccessExpression extends Expression {
  expression: Expression;
  objectType: Type;
  propertyType: Type;
  member: string;

  constructor(expression: Expression, objectType: Type, propertyType: Type, member: string) {
    super();
    this.expression = expression;
    this.objectType = objectType;
    this.propertyType = propertyType;
    this.member = member;
  }

  override print(ctx: PrintContext) {
    let member = this.member;
    // Handle optional and smarter pointer types.
    if (this.hand != 'left') {
      if (this.propertyType.isGCedType())
        member += '.Get()';
      else if (this.propertyType.optional)
        member += '.value()';
    }
    // Pointer or value access.
    const dot = this.objectType.isGCedType() ? '->' : '.';
    return this.expression.print(ctx) + dot + member;
  }
}

export class VariableDeclaration extends Declaration {
  identifier: string;
  type: Type;
  initializer?: Expression;

  constructor(identifier: string, type: Type, initializer?: Expression) {
    super();
    this.identifier = identifier;
    this.type = type;
    this.initializer = initializer;
  }

  override print(ctx: PrintContext) {
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
    this.initializer = initializer;
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
    this.initializer = initializer;
  }

  override print(ctx: PrintContext) {
    const modifiers: TypeModifier[] = [];
    if (this.parent?.type.isGCedType())
      modifiers.push('gced-class-property');
    let result = `${ctx.prefix}${this.type.print(ctx, modifiers)} ${this.name}`;
    if (this.initializer)
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
    if (this.type.isGCedType()) {
      // Add Trace method if it includes cppgc::Member.
      const trace = createTraceMethod(members);
      if (trace)
        this.publicMembers.push(trace);
      // Add a virtual destructor if the class is not trivially destrutible.
      if (members.find(m => m instanceof PropertyDeclaration))
        this.publicMembers.push(new DestructorDeclaration(this.name, [ 'virtual' ]));
    }
  }

  override print(ctx: PrintContext) {
    if (ctx.mode == 'forward')
      return `class ${this.name};`;
    const halfPadding = ctx.padding + ' '.repeat(ctx.indent / 2);
    const inheritance = this.type.isGCedType() ? ' : public compilets::Object' : '';
    let result = `${ctx.prefix}class ${this.name}${inheritance} {\n`;
    ctx.level++;
    if (this.publicMembers.length > 0) {
      result += `${halfPadding}public:\n`;
      result += this.publicMembers.map(m => m.print(ctx) + '\n\n').join('');
    }
    if (this.protectedMembers.length > 0) {
      result += `${halfPadding}protected:\n`;
      result += this.protectedMembers.map(m => m.print(ctx) + '\n\n').join('');
    }
    if (this.privateMembers.length > 0) {
      result += `${halfPadding}private:\n`;
      result += this.privateMembers.map(m => m.print(ctx) + '\n\n').join('');
    }
    ctx.level--;
    if (result.endsWith('\n\n'))
      result = result.slice(0, -1);
    result += ctx.padding + '};\n';
    return result;
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
        new ExpressionStatement(new RawExpression("compilets::State state")),
        ...this.body.statements,
        new ReturnStatement(new RawExpression('0')),
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
    this.expression = expression;
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

  constructor(stat: Statement, expr: Expression) {
    super();
    this.statement = stat;
    this.expression = expr;
  }

  override print(ctx: PrintContext) {
    return `${ctx.prefix}do ${this.statement.print(ctx)} while (${this.expression.print(ctx)});`;
  }
}

export class WhileStatement extends Statement {
  statement: Statement;
  expression: Expression;

  constructor(stat: Statement, expr: Expression) {
    super();
    this.statement = stat;
    this.expression = expr;
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
    this.condition = condition;
    this.incrementor = incrementor;
  }

  override print(ctx: PrintContext) {
    return `${ctx.prefix}for (${this.initializer?.print(ctx) ?? ''}; ${this.condition?.print(ctx) ?? ''}; ${this.incrementor?.print(ctx) ?? ''}) ${this.statement.print(ctx)}`;
  }
}

export class ReturnStatement extends Statement {
  expression?: Expression;

  constructor(expression?: Expression) {
    super();
    this.expression = expression;
  }

  override print(ctx: PrintContext) {
    if (this.expression)
      return `${ctx.prefix}return ${this.expression!.print(ctx)};`;
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
