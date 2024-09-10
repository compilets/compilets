class A {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

// compilets: persistent
let a: A | undefined = new A();
gc!();
a = undefined;
gc!();
process.exit(1);
