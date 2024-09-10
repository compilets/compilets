class Prop {}

class Base {
  public prop: Prop;

  constructor(prop: Prop) {
    this.prop = prop;
  }

  method(arg?: Prop) {}
}

class Derived extends Base {
  public childProp?: Prop;

  constructor() {
    super(new Prop());
  }

  override method(arg?: Prop) {
    super.method(arg);
  }
}

class NotDerived {
}

function TestInheritance() {
  const base: Base = new Derived();
}
