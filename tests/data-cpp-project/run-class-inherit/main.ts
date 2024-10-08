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
let base: Base | undefined = new Derived();
if (base.method() != "derived")
  process.exit(2);
gc!();
base = undefined;
gc!();
process.exit(1);
