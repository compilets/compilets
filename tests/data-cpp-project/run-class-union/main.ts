class Member {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

class Owner {
  member?: Member | number;
}

// compilets: persistent
const o = new Owner;
o.member = new Member;
gc();
o.member = 123;
gc();
process.exit(1);
