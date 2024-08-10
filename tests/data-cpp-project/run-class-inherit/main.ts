class Prop {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

class Base {
  public prop: Prop = new Prop();

  method() { return 'base'; }
}

class Derived extends Base {
  method() { return 'derived'; }
}

// compilets: persistent
let base = new Derived();
if (base.method() != "derived")
  process.exit(2);
gc();
base = null;
gc();
process.exit(1);
