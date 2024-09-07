class Member {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

class Owner<T> {
  member: T | boolean;

  constructor(obj: T) {
    this.member = obj;
  }
}

// compilets: persistent
const o = new Owner(new Member());
gc();
o = undefined;
gc();
process.exit(1);
