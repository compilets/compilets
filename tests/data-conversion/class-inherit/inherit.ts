class Prop {}

class Base {
  public prop: Prop;

  constructor() {
  }
}

class Derived extends Base {
  public childProp: Prop;

  constructor() {
  }
}

class NotDerived implements Base {
}

function TestInheritance() {
  const base: Base = new Derived();
}
