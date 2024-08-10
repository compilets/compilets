class A {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

// compilets: persistent
const a = new A();
gc();
a = null;
gc();
process.exit(1);
