class LinkNode {
  static count = 0;

  next?: LinkNode;

  // compilets: destructor
  destructor() {
    LinkNode.count++;
  }
}

// compilets: persistent
const a = new LinkNode();
const b = new LinkNode();
const c = new LinkNode();
a.next = b;
b.next = c;
c.next = a;
gc();
a = null;
gc();
process.exit(LinkNode.count == 3 ? 0 : 1);
