class Empty {
}

class EmptyConstructor {
  constructor() {
  }
}

class NonSimple {
  static count = 0;

  private prop = 'For a breath I tarry.';

  constructor(a: boolean, b = 123) {
    let c = a ? b : 456;
    NonSimple.count++;
  }

  public method() {
    return this.prop;
  }
}

function TestClass() {
  const s = new NonSimple(false);
  if (NonSimple.count != 1)
    return;
  const r = s.method();
}
