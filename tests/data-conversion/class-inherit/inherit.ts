class Prop {}

class Base {
  public prop: Prop;

  constructor(prop: Prop) {
    this.prop = prop;
  }

  method() {}
}

class Derived extends Base {
  public childProp?: Prop;

  constructor() {
    super(new Prop());
  }

  override method() {}
}

class NotDerived implements Base {
}

function TestInheritance() {
  const base: Base = new Derived();
}
