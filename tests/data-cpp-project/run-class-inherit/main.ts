class Prop {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

class Base {
  public prop: Prop = new Prop();
}

class Derived extends Base {
}

// compilets: persistent
let derived = new Derived();
gc();
derived = null;
gc();
process.exit(1);
