class Prop {}

class Owner {
  public prop1: Prop;
  public prop2: Prop;

  constructor(prop: Prop) {
    this.prop1 = prop;
    this.prop2 = prop;
  }
}

function TestNested() {
  const o = new Owner(new Prop);
  o.prop1 = o.prop2;
}
