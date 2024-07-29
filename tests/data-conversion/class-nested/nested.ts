class Prop {}

class Owner {
  private prop1: Prop;
  private prop2: Prop;
}

function TestNested() {
  const o = new Owner();
  o.prop1 = o.prop2;
}
