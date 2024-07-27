class Empty {
}

class EmptyConstructor {
  constructor() {
  }
}

class Simple {
  private prop = 'For a breath I tarry.';

  constructor(a: boolean, b = 123) {
    let c = a ? b : 456;
  }

  protected method() {
    return true;
  }
}

function TestClass() {
  const s = new Simple(false);
  const r = s.method();
}
