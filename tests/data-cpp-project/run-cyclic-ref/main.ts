class Alice {
  osananajimi: Bob;
}

class Bob {
  osananajimi: Alice;
}

const alice = new Alice();
const bob = new Bob();
alice.osananajimi = bob;
bob.osananajimi = alice;
