// Control indentation and other formating options when printing AST to C++.
export class PrintContext {
  indent: number;
  level = 0;

  constructor(indent: number) {
    this.indent = indent;
  }

  get padding() {
    return ' '.repeat(this.level * this.indent);
  }
}

// Increase the indentaion level.
export class PrintScope {
  context: PrintContext;

  constructor(context: PrintContext) {
    this.context = context;
    this.context.level++;
  }

  [Symbol.dispose]() {
    this.context.level--;
  }
}

// ===================== Defines the syntax of C++ below =====================

export abstract class Declaration {
  abstract print(ctx: PrintContext): string;
}

export abstract class Expression {
  abstract print(ctx: PrintContext): string;
}

export abstract class Statement {
  abstract print(ctx: PrintContext): string;
}

export type TypeCategory = 'primitive' | 'string';

export class Type {
  name: string;
  category: TypeCategory;

  constructor(name: string, category: TypeCategory) {
    this.name = name;
    this.category = category;
  }

  equal(other: Type) {
    return this.name == other.name && this.category == other.category;
  }

  print(ctx: PrintContext) {
    if (this.category == 'string')
      return 'std::string';
    return this.name;
  }
}

// A special expression where JS text is same with C++ text.
export class RawExpression extends Expression {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  print(ctx: PrintContext) {
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

  print(ctx: PrintContext) {
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

  print(ctx: PrintContext) {
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
    this.right = right;
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

  print(ctx: PrintContext) {
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

  print(ctx: PrintContext) {
    let type = this.declarations[0].type.print(ctx);
    return `${type} ${this.declarations.map(d => d.print(ctx)).join(', ')}`;
  }
}

export class ParameterDeclaration extends Declaration {
  name: string;
  type: Type;
  initializer?: Expression;

  constructor(name: string, type: Type, initializer?: Expression) {
    super();
    this.name = name;
    this.type = type;
    this.initializer = initializer;
  }

  print(ctx: PrintContext) {
    let result = `${this.type.print(ctx)} ${this.name}`;
    if (this.initializer)
      result += ` = ${this.initializer.print(ctx)}`;
    return result;
  }
}

export abstract class ClassElement extends Declaration {
  modifiers: string[];

  constructor(modifiers?: string[]) {
    super();
    this.modifiers = modifiers ?? [];
  }
}

export class ConstructorDeclaration extends ClassElement {
  parameters: ParameterDeclaration[];
  body?: Block;

  constructor(parameters: ParameterDeclaration[], body?: Block) {
    super();
    this.parameters = parameters;
    this.body = body;
  }

  print(ctx: PrintContext) {
    let result = `${ctx.padding}constructor(`;
    if (this.parameters.length > 0)
      result += this.parameters.map(p => p.print(ctx)).join(', ');
    result += ') ';
    if (this.body)
      result += this.body.print(ctx);
    else
      result += '{}';
    return result;
  }
}

export class PropertyDeclaration extends ClassElement {
  name: string;
  type: Type;
  initializer?: Expression;

  constructor(modifiers: string[], name: string, type: Type, initializer?: Expression) {
    super(modifiers);
    this.name = name;
    this.type = type;
    this.initializer = initializer;
  }

  print(ctx: PrintContext) {
    let result = `${ctx.padding}${this.type.print(ctx)} ${this.name}`;
    if (this.initializer)
      result += ` = ${this.initializer.print(ctx)}`;
    return result + ';';
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
  members: ClassElement[];

  constructor(name: string, members: ClassElement[]) {
    super(name);
    this.members = members;
  }

  override print(ctx: PrintContext) {
    if (this.members.length == 0)
      return `class ${this.name} {};\n`;
    using scope = new PrintScope(ctx);
    const body = this.members.map(m => m.print(ctx)).join('\n\n');
    return `class ${this.name} {\n${body}\n};\n`;
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
    return this.statements.map(s => ctx.padding + s.print(ctx)).join('\n');
  }
}

export class Block extends Paragraph {
  override print(ctx: PrintContext) {
    if (this.statements?.length > 0) {
      const end = '\n' + ctx.padding + '}';
      using scope = new PrintScope(ctx);
      return '{\n' + super.print(ctx) + end;
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
    return `${this.declarationList.print(ctx)};`;
  }
}

export class ExpressionStatement extends Statement {
  expression: Expression;

  constructor(expr: Expression) {
    super();
    this.expression = expr;
  }

  override print(ctx: PrintContext) {
    return `${this.expression.print(ctx)};`;
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
    return `do ${this.statement.print(ctx)} while (${this.expression.print(ctx)});`;
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
    return `while (${this.expression.print(ctx)}) ${this.statement.print(ctx)}`;
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
    return `for (${this.initializer?.print(ctx) ?? ''}; ${this.condition?.print(ctx) ?? ''}; ${this.incrementor?.print(ctx) ?? ''}) ${this.statement.print(ctx)}`;
  }
}
