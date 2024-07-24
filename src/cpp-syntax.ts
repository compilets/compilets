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
  category: string;

  constructor(name: string, category: string) {
    this.name = name;
    this.category = category;
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
    let result = `${this.type.print(opts)} ${this.identifier}`
    if (this.initializer)
      result += ` = ${this.initializer.print(opts)}`;
    return result;
  }
};

export class VariableStatement extends Statement {
  declarationList: VariableDeclaration[] = [];

  constructor(decl: VariableDeclaration) {
    super();
    this.declarationList.push(decl);
  }

  override print(opts: PrintOptions) {
    if (this.declarationList.length > 1)
      throw new Error(`Multi-variable declarations is not implemented`);
    return `${this.declarationList[0].print(opts)};`;
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
