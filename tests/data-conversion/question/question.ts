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

  let i = head.item;
  head.next.item = 3;
  TakeNumber(head.item!);

  let n: number = true ? head.item! : 0;
  let l: LinkNode = true ? head : head.next!;

  let memberExam = head.item!;
  let valueExam = i!;
}

function TakeNumber(n: number) {
}
