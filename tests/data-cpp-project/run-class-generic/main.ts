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
let o: Owner<Member> | undefined = new Owner(new Member());
gc!();
o = undefined;
gc!();
process.exit(1);
