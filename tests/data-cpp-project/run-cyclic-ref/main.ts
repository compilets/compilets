class LinkNode {
  static count = 0;

  next?: LinkNode;

  // compilets: destructor
  destructor() {
    LinkNode.count++;
  }
}

// compilets: persistent
let a: LinkNode | undefined = new LinkNode();
const b = new LinkNode();
const c = new LinkNode();
a.next = b;
b.next = c;
c.next = a;
gc!();
a = undefined;
gc!();
process.exit(LinkNode.count == 3 ? 0 : 1);
