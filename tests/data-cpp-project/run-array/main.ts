class Member {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

class Owner {
  members: Member[] = [new Member];
}

// compilets: persistent
let owner = new Owner;
gc();
owner = null;
gc();
process.exit(1);
