import {
  ClassElement,
  PropertyDeclaration,
  DestructorDeclaration,
} from './cpp-syntax';
import {
  notTriviallyDestructible,
  createTraceMethod,
  printTypeNameForDeclaration,
} from './cpp-syntax-utils';
import {
  cloneMap,
} from './js-utils';

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
export type Feature = 'string' | 'union' | 'array' | 'function' |
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
   * Current namespace.
   */
  namespace: string | undefined;
  /**
   * The depth of indentation.
   */
  level = 0;
  /**
   * Used C++ features when printing.
   */
  features = new Set<Feature>();
  /**
   * The generated interfaces when printing.
   */
  interfaces = new Set<string>();
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

export type TypeCategory = 'void' | 'null' | 'primitive' | 'string' | 'union' |
                           'array' | 'functor' | 'function' | 'class' |
                           'interface' | 'external' | 'super' | 'template' |
                           'any';
export type TypeModifier = 'variadic' | 'optional' | 'property' | 'static' |
                           'external' | 'element' | 'persistent' |
                           'not-function';

/**
 * Representing a C++ type.
 */
export class Type {
  name: string;
  category: TypeCategory;
  types: Type[] = [];
  base?: Type;
  namespace?: string;
  templateArguments?: Type[];
  isVariadic = false;
  isOptional = false;
  isProperty = false;
  isStatic = false;
  isExternal = false;
  isElement = false;
  isPersistent = false;

  static createStringType(modifiers?: TypeModifier[]) {
    const type = new Type('String', 'string', modifiers);
    type.namespace = 'compilets';
    return type;
  }

  static createNumberType(modifiers?: TypeModifier[]) {
    return new Type('double', 'primitive', modifiers);
  }

  constructor(name: string, category: TypeCategory, modifiers?: TypeModifier[]) {
    this.name = name;
    this.category = category;
    if (modifiers) {
      for (const modifier of modifiers) {
        if (modifier == 'variadic')
          this.isVariadic = true;
        else if (modifier == 'optional')
          this.isOptional = true;
        else if (modifier == 'external')
          this.isExternal = true;
        else if (modifier == 'property')
          this.isProperty = true;
        else if (modifier == 'static')
          this.isStatic = true;
        else if (modifier == 'element')
          this.isElement = true;
        else if (modifier == 'persistent')
          this.isPersistent = true;
        else if (modifier == 'not-function' && this.category == 'function')
          this.category = 'functor';
      }
    }
    if (this.category == 'any' && !this.isExternal)
      throw new Error('The "any" type is not supported');
  }

  print(ctx: PrintContext): string {
    if (this.category == 'interface')
      ctx.interfaces.add(this.name);
    return printTypeNameForDeclaration(this, ctx);
  }

  /**
   * Check if this is the same type with `other`.
   *
   * Modifiers static/property/external/element/persistent are ignored.
   */
  equal(other?: Type): boolean {
    if (!other)
      return false;
    if (this === other)
      return true;
    if (this.name != other.name ||
        this.category != other.category ||
        this.namespace != other.namespace ||
        this.isVariadic != other.isVariadic)
      return false;
    // For object types the optional modifier does not affect its C++ type.
    if (!this.isObject() && this.isOptional != other.isOptional)
      return false;
    // For unions, compare all subtypes.
    if (this.category != 'union')
      return true;
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
    // Derived class can be assigned to base class.
    if (other.inheritsFrom(this)) {
      return true;
    }
    // Union can be directly assigned with its subtype.
    if (this.category == 'union' && other.category != 'union') {
      return this.types.some(t => t.assignableWith(other));
    }
    // Union can be directly assigned with another union with subtypes.
    if (this.category == 'union' && other.category == 'union') {
      return other.types.some(t => this.assignableWith(t));
    }
    // Optional types can be assigned with non-optional object.
    if (this.isOptional && this.noOptional().equal(other)) {
      return true;
    }
    return this.equal(other);
  }

  /**
   * Overwrite this type with the other.
   */
  overwriteWith(other: Type): this {
    this.types = other.types?.map(t => t.clone());
    this.base = other.base?.clone();
    this.namespace = other.namespace;
    this.templateArguments = other.templateArguments?.map(a => a.clone());
    this.isVariadic = other.isVariadic;
    this.isOptional = other.isOptional;
    this.isProperty = other.isProperty;
    this.isStatic = other.isStatic;
    this.isExternal = other.isExternal;
    this.isElement = other.isElement;
    this.isPersistent = other.isPersistent;
    return this;
  }

  /**
   * Create a new instance of Type that is completely the same with this one.
   */
  clone(): Type {
    const newType = new Type(this.name, this.category);
    newType.overwriteWith(this);
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
   * Create a new instance of Type that removes the `property` modifier.
   */
  noProperty() {
    const result = this.clone();
    result.isProperty = false;
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
    } else if (this.category == 'functor') {
      ctx.features.add('function');
    } else if (this.category == 'union') {
      ctx.features.add('union');
    } else if (this.category == 'array') {
      ctx.features.add('array');
    }
    if (this.namespace == 'compilets') {
      if (this.category != 'string')
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
   * Return whether this type inherits from base.
   */
  inheritsFrom(base: Type): boolean {
    if (!this.isObject() || !base.isObject())
      return false;
    if (!this.base)
      return false;
    if (this.base.equal(base))
      return true;
    return this.base.inheritsFrom(base);
  }

  /**
   * Whether this type can be trivially destructed.
   */
  isTriviallyDestructible(): boolean {
    return this.category == 'void' ||
           this.category == 'null' ||
           this.category == 'primitive';
  }

  /**
   * Whether this type inherits from Object.
   */
  isObject() {
    return this.category == 'array' ||
           this.category == 'functor' ||
           this.category == 'class' ||
           this.category == 'interface' ||
           this.category == 'super';
  }

  /**
   * Whether this type or the types it contains inherit from Object.
   */
  hasObject(): boolean {
    if (this.isObject())
      return true;
    if (this.category == 'union')
      return this.types.some(t => t.hasObject());
    return false;
  }

  /**
   * Whether this type or the types it contains has template type..
   */
  hasTemplate(): boolean {
    if (this.category == 'template')
      return true;
    return this.types.some(t => t.hasTemplate());
  }

  /**
   * Whether this type is represented by std::optional.
   */
  isStdOptional() {
    return this.category != 'union' &&
           this.category != 'template' &&
           this.isOptional &&
           !this.hasObject();
  }

  /**
   * Whether this type is wrapped by cppgc::Member.
   */
  isCppgcMember() {
    return (this.isObject() || this.category == 'template') &&
           (this.isProperty || this.isElement);
  }
}

/**
 * Representing the type of interface and object literals.
 */
export class InterfaceType extends Type {
  properties = new Map<string, Type>;

  constructor(name: string, modifiers?: TypeModifier[]) {
    super(name, 'interface', modifiers);
    this.namespace = 'compilets::generated';
  }

  override print(ctx: PrintContext): string {
    ctx.features.add('object');
    ctx.interfaces.add(this.name);
    return super.print(ctx);
  }

  override equal(other?: InterfaceType): boolean {
    if (!other)
      return false;
    if (this === other)
      return true;
    if (this.properties.size != other.properties.size)
      return false;
    for (const [name, type] of this.properties) {
      if (!type.equal(other.properties.get(name)))
        return false;
    }
    return true;
  }

  override overwriteWith(other: InterfaceType): this {
    super.overwriteWith(other);
    this.properties = cloneMap(other.properties, (p) => p.clone());
    return this;
  }

  override clone(): InterfaceType {
    const newType = new InterfaceType(this.name);
    newType.overwriteWith(this);
    return newType;
  }

  /**
   * Print the C++ declaration of an interface.
   *
   * It is similar to printClassDeclaration but without class specific things.
   */
  printDeclaration(ctx: PrintContext): string {
    const members: ClassElement[] = [];
    for (const [name, type] of this.properties) {
      members.push(new PropertyDeclaration(name, [ 'abstract' ], type));
    }
    if (notTriviallyDestructible(members)) {
      const trace = createTraceMethod(this, members);
      if (trace)
        members.push(trace);
      members.push(new DestructorDeclaration(this.name, [ 'virtual' ]));
    }
    let result = `${ctx.prefix}struct ${this.name} : public compilets::Object {\n`;
    ctx.level++;
    result += members.map(m => m.print(ctx)).join('\n\n');
    ctx.level--;
    if (members.length > 0)
      result += '\n';
    result += ctx.padding + '};';
    return result;
  }
}

/**
 * Stores all interfaces and object literals found in the TypeScript, and make
 * sure same types return same names.
 */
export class InterfaceRegistry {
  types: InterfaceType[] = [];

  register(type: InterfaceType): InterfaceType {
    // Find the same interface or save it.
    let existing = this.types.find(t => t.equal(type));
    if (!existing) {
      const len = this.types.push(type);
      // Rename to unique name.
      existing = type;
      existing.name = `Interface${len}`;
    }
    // Return a clone as caller may modify type.
    const result = existing.clone();
    // Retain the modifiers of the passed type.
    result.isProperty = type.isProperty;
    result.isStatic = type.isStatic;
    result.isExternal = type.isExternal;
    result.isElement = type.isElement;
    result.isPersistent = type.isPersistent;
    return result;
  }

  get(name: string): InterfaceType {
    const type = this.types.find(t => t.name == name);
    if (!type)
      throw new Error(`Can not find an interface with name of "${name}"`);
    return type;
  }
}