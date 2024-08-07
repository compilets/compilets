class Member {
  // compilets: destructor
  destructor() {
    process.exit(0);
  }
}

class Owner {
  members: Member[] = [new Member];
}

new Owner;
gc();
process.exit(1);
