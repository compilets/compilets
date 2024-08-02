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

  protected method() {
    return true;
  }
}

function TestClass() {
  const s = new NonSimple(false);
  const r = s.method();
  NonSimple.count == 1;
}
