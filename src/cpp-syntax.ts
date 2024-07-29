import {createTraceMethod} from './cpp-syntax-class';

/**
 * Possible modes for generating the project.
 */
export type GenerationMode = 'lib' | 'exe' | 'napi';

/**
 * Possible modes for printing the syntax node.
 */
export type PrintMode = 'impl' | 'header';

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

  constructor(generationMode: GenerationMode, mode: PrintMode, indent: number = 2) {
    this.generationMode = generationMode;
    this.mode = mode;
    this.indent = indent;
  }

  get padding() {
    return ' '.repeat(this.level * this.indent);
  }
}

/**
 * Extra options for printing type.
 */
type TypePrintContext = 'new' | 'gced-class-property';

// ===================== Defines the syntax of C++ below =====================

export type TypeCategory = 'void' |
                           'primitive' |
                           'string' |
                           'functor' |
                           'raw-class' | 'stack-class' | 'gced-class';

export class Type {
  name: string;
  category: TypeCategory;

  constructor(name: string, category: TypeCategory) {
    this.name = name;
    this.category = category;
  }

  print(ctx: PrintContext, typeContext?: TypePrintContext) {
    if (this.category == 'string')
      return 'std::string';
    if (this.isClass()) {
      if (this.isGCedClass()) {
        switch (typeContext) {
          case 'new':
            return `${this.name}*`;
          case 'gced-class-property':
            return `cppgc::Member<${this.name}>`;
          default:
            return `cppgc::Persistent<${this.name}>`;
        }
      } else {
        return `${this.name}*`;
      }
    }
    return this.name;
  }

  equal(other: Type) {
    return this.name == other.name && this.category == other.category;
  }

  isClass() {
    return this.category == 'raw-class' ||
           this.category == 'stack-class' ||
           this.category == 'gced-class';
  }

  isGCedClass() {
    return this.category == 'gced-class';
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
    return `[=](${parameters}) -> ${returnType} ${body}`;
  }
}

export class CallExpression extends Expression {
  expression: Expression;
  args: Expression[];

  constructor(expression: Expression, args: Expression[]) {
    super();
    this.expression = expression;
    this.args = args;
  }

  override print(ctx: PrintContext) {
    const args = this.args.map(a => a.print(ctx)).join(', ');
    return `${this.expression.print(ctx)}(${args})`;
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
    if (this.type.isGCedClass()) {
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
    // Pointer or value access.
    const dot = this.objectType.isGCedClass() ? '->' : '.';
    // GCed class member is a smart pointer.
    let member = this.member;
    if (this.propertyType.isGCedClass()) {
      if (this.hand != 'left')
        member += '.Get()';
    }
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
    const type = this.declarations[0].type.print(ctx, 'new');
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
    const body = this.body?.print(ctx) ?? '{}';
    return `${ctx.padding}${this.name}(${parameters}) ${body}`;
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
    const typeContext = this.parent?.type.isGCedClass() ? 'gced-class-property' : undefined;
    let result = `${ctx.padding}${this.type.print(ctx, typeContext)} ${this.name}`;
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
    let result = `${ctx.padding}${this.returnType.print(ctx)} ${this.name}(`;
    result += ParameterDeclaration.printParameters(ctx, this.parameters);
    result += ') ';
    if (this.modifiers.includes('const'))
      result += 'const ';
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
    if (this.type.isGCedClass()) {
      this.publicMembers.push(createTraceMethod(this));
    }
  }

  override print(ctx: PrintContext) {
    const halfPadding = ctx.padding + ' '.repeat(ctx.indent / 2);
    const inheritance = this.type.isGCedClass() ? ` : public cppgc::GarbageCollected<${this.name}>` : '';
    let result = `${ctx.padding}class ${this.name}${inheritance} {\n`;
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
    const body = this.body?.print(ctx) ?? '{}';
    return `${returnType} ${this.name}(${parameters}) ${body}`;
  }
}

// A special declaration for putting the top-level statements of the entry
// script into the "main" function.
export class MainFunction extends DeclarationStatement {
  body: Block;

  constructor() {
    super('main');
    this.body = new Block([ new ReturnStatement(new RawExpression('0')) ]);
  }

  override print(ctx: PrintContext) {
    const main = ctx.generationMode == 'exe' ? 'main(int, const char*[])'
                                             : 'Main()';
    if (ctx.generationMode == 'exe') {
      this.body.statements.unshift(new ExpressionStatement(new RawExpression("compilets::State state;")));
    }
    return `${ctx.padding}int ${main} ${this.body.print(ctx)}`;
  }

  addStatement(statement: Statement) {
    this.body.statements.splice(this.body.statements.length - 1, 0, statement);
  }

  isEmpty() {
    return this.body.statements.length == 1;
  }
}

// Multiple statements without {}, this is used for convenient internal
// implementations where one JS statement maps to multiple C++ ones.
export class Paragraph extends Statement {
  statements: Statement[];

  constructor(statements?: Statement[]) {
    super();
    this.statements = statements ?? [];
  }

  override print(ctx: PrintContext) {
    return this.statements.map(s => s.print(ctx)).join('\n');
  }
}

export class Block extends Paragraph {
  override print(ctx: PrintContext) {
    if (this.statements?.length > 0) {
      ctx.level++;
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
    return `${ctx.padding}${this.declarationList.print(ctx)};`;
  }
}

export class ExpressionStatement extends Statement {
  expression: Expression;

  constructor(expr: Expression) {
    super();
    this.expression = expr;
  }

  override print(ctx: PrintContext) {
    return `${ctx.padding}${this.expression.print(ctx)};`;
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
    return `${ctx.padding}do ${this.statement.print(ctx)} while (${this.expression.print(ctx)});`;
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
    return `${ctx.padding}while (${this.expression.print(ctx)}) ${this.statement.print(ctx)}`;
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
    return `${ctx.padding}for (${this.initializer?.print(ctx) ?? ''}; ${this.condition?.print(ctx) ?? ''}; ${this.incrementor?.print(ctx) ?? ''}) ${this.statement.print(ctx)}`;
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
      return `${ctx.padding}return ${this.expression!.print(ctx)};`;
    else
      return `${ctx.padding}return;`;
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
      results.push(this.c.map(h => h.print(ctx)).join(''));
    if (this.stl.length > 0)
      results.push(this.stl.map(h => h.print(ctx)).join(''));
    if (this.files.length > 0)
      results.push(this.files.map(h => h.print(ctx)).join(''));
    return results.map(h => h + '\n').join('');
  }
}
