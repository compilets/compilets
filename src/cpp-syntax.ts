export type TypeCategory = 'primitive' | 'string';

export class Type {
  name: string;
  category: string;

  constructor(name: string, category: string) {
    this.name = name;
    this.category = category;
  }

  toString() {
    if (this.category == 'string')
      return 'std::string';
    return this.name;
  }
};

export class NumericLiteral {
  text: string;

  constructor(text: string) {
    this.text = text;
  }

  toString() {
    return this.text;
  }
};

export class StringLiteral {
  text: string;

  constructor(text: string) {
    this.text = text;
  }

  toString() {
    return `"${this.text}"`;
  }
};

export type InitializerType = NumericLiteral | StringLiteral;

export class VariableDeclaration {
  identifier: string;
  type: Type;
  initializer?: InitializerType;

  constructor(identifier: string, type: Type, initializer?: InitializerType) {
    this.identifier = identifier;
    this.type = type;
    this.initializer = initializer;
  }

  toString() {
    let result = `${this.type} ${this.identifier}`
    if (this.initializer)
      result += ` = ${this.initializer}`;
    return result;
  }
};

export abstract class Statement {
  abstract toString(): string;
};

export class VariableStatement extends Statement {
  declarationList: VariableDeclaration[] = [];

  constructor(decl: VariableDeclaration) {
    super();
    this.declarationList.push(decl);
  }

  override toString() {
    if (this.declarationList.length > 1)
      throw new Error(`Multi-variable declarations is not implemented`);
    return `${this.declarationList[0]};`;
  }
};
