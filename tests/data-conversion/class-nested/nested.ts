class Prop {}

class Owner {
  private prop1: Prop;
  private prop2: Prop;

  constructor(prop: Prop) {
    this.prop1 = prop;
    this.prop2 = prop;
  }
}

function TestNested() {
  const o = new Owner();
  o.prop1 = o.prop2;
}
