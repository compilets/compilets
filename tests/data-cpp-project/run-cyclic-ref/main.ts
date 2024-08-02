class LinkNode {
  next?: LinkNode;

  // compilets: destructor
  destructor() {
  }
}

const a = new LinkNode();
const b = new LinkNode();
const c = new LinkNode();
a.next = b;
b.next = c;
c.next = a;
gc();
