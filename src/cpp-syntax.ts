export interface PrintOptions {
};

export abstract class Expression {
  abstract print(opts: PrintOptions): string;
};

export abstract class Statement {
  abstract print(opts: PrintOptions): string;
};

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

  print(opts: PrintOptions) {
    if (this.category == 'string')
      return 'std::string';
    return this.name;
  }
};

// A special expression where JS text is same with C++ text.
export class RawExpression extends Expression {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  print(opts: PrintOptions) {
    return this.text;
  }
};

export class StringLiteral extends RawExpression {
  constructor(text: string) {
    super(`"${text}"`);
  }
};

export class ParenthesizedExpression extends Expression {
  expression: Expression;

  constructor(expr: Expression) {
    super();
    this.expression = expr;
  }

  override print(opts: PrintOptions) {
    return `(${this.expression.print(opts)})`;
  }
};

export class PostfixUnaryExpression extends Expression {
  operand: Expression;
  operator: string;

  constructor(operand: Expression, operator: string) {
    super();
    this.operand = operand;
    this.operator = operator;
  }

  print(opts: PrintOptions) {
    return `${this.operand.print(opts)}${this.operator}`;
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

  print(opts: PrintOptions) {
    return `${this.operator}${this.operand.print(opts)}`;
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

  override print(opts: PrintOptions) {
    return `${this.left.print(opts)} ${this.operator} ${this.right.print(opts)}`;
  }
};

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

  override print(opts: PrintOptions) {
    return `${this.condition.print(opts)} ? ${this.whenTrue.print(opts)} : ${this.whenFalse.print(opts)}`;
  }
};

export class VariableDeclaration {
  identifier: string;
  type: Type;
  initializer?: Expression;

  constructor(identifier: string, type: Type, initializer?: Expression) {
    this.identifier = identifier;
    this.type = type;
    this.initializer = initializer;
  }

  print(opts: PrintOptions) {
    if (this.initializer)
      return `${this.identifier} = ${this.initializer.print(opts)}`;
    else
      return this.identifier;
  }
};

export class VariableDeclarationList {
  declarations: VariableDeclaration[];

  constructor(decls: VariableDeclaration[]) {
    this.declarations = decls;
  }

  print(opts: PrintOptions) {
    let type = this.declarations[0].type.print(opts);
    return `${type} ${this.declarations.map(d => d.print(opts)).join(', ')}`;
  }
}

// Multiple statements without a scope, this is used for convenient internal
// implementations where one JS statement maps to multiple C++ ones.
export class Paragraph extends Statement {
  statements: Statement[];

  constructor(statements: Statement[]) {
    super();
    this.statements = statements;
  }

  override print(opts: PrintOptions) {
    return this.statements.map(s => s.print(opts)).join('\n');
  }
}

export class Block extends Paragraph {
  override print(opts: PrintOptions) {
    return '{\n' + super.print(opts) + '\n}';
  }
}

export class VariableStatement extends Statement {
  declarationList: VariableDeclarationList;

  constructor(list: VariableDeclarationList) {
    super();
    this.declarationList = list;
  }

  override print(opts: PrintOptions) {
    return `${this.declarationList.print(opts)};`;
  }
};

export class ExpressionStatement extends Statement {
  expression: Expression;

  constructor(expr: Expression) {
    super();
    this.expression = expr;
  }

  override print(opts: PrintOptions) {
    return `${this.expression.print(opts)};`;
  }
};

export class DoStatement extends Statement {
  statement: Statement;
  expression: Expression;

  constructor(stat: Statement, expr: Expression) {
    super();
    this.statement = stat;
    this.expression = expr;
  }

  override print(opts: PrintOptions) {
    return `do ${this.statement.print(opts)} while (${this.expression.print(opts)});`;
  }
};

export class WhileStatement extends Statement {
  statement: Statement;
  expression: Expression;

  constructor(stat: Statement, expr: Expression) {
    super();
    this.statement = stat;
    this.expression = expr;
  }

  override print(opts: PrintOptions) {
    return `while (${this.expression.print(opts)}) ${this.statement.print(opts)}`;
  }
};

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

  override print(opts: PrintOptions) {
    return `for (${this.initializer?.print(opts) ?? ''}; ${this.condition?.print(opts) ?? ''}; ${this.incrementor?.print(opts) ?? ''}) ${this.statement.print(opts)}`;
  }
};
