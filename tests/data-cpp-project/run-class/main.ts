class A {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

const a = new A();
gc();
process.exit(1);
