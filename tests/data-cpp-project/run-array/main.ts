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
let owner: Owner | undefined = new Owner;
gc!();
owner = undefined;
gc!();
process.exit(1);
