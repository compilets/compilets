class Prop {}

class Base {
  public prop: Prop;

  constructor(prop: Prop) {
    this.prop = prop;
  }
}

class Derived extends Base {
  public childProp?: Prop;

  constructor() {
    super(new Prop());
  }
}

class NotDerived implements Base {
}

function TestInheritance() {
  const base: Base = new Derived();
}
