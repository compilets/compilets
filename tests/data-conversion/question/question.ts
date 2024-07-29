class LinkNode {
  item: number;
  next?: LinkNode;

  constructor(item: number){
    this.item = item;
  }
}

function TestQuestionToken() {
  const head = new LinkNode(0);
  if (!head.next) {
    head.next = new LinkNode(1);
  }
}
