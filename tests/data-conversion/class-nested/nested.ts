class Prop {}

class Owner {
  public prop1: Prop;
  public prop2: Prop;

  constructor(prop: Prop) {
    this.prop1 = prop;
    this.prop2 = prop;
  }

  method() {
    return () => this.prop1;
  }
}

function TestNested() {
  const o = new Owner(new Prop);
  o.prop1 = o.prop2;

  const getter = o.method();
  const p = getter();
}
