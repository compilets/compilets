class LinkNode {
  item?: number;
  next?: LinkNode;

  constructor(item: number) {
    this.item = item;
  }
}

function TestQuestionTokenInClass() {
  const head = new LinkNode(0);
  if (!head.next) {
    head.next = new LinkNode(1);
  }
  let n = head.item;
  head.next.item = 3;
  TakeNumber(head.item);
}

function TakeNumber(n: number) {
}
