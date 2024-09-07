class LinkNode {
  item: number | boolean | undefined;
  next: LinkNode | undefined;
}

function TestUndefined() {
  let undef = undefined;
  let orUndefined: number | undefined = 123;
  orUndefined = undefined;
  orUndefined = undef;
  let orNull: number | null;
  orNull = null;
  let optionalUnion: number | boolean | undefined;
  optionalUnion = undefined;

  let node = new LinkNode;
  node.item = true;
  node.next = new LinkNode;
  node.next = undefined;
}
