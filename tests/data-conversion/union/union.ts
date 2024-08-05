function TakeOptionalUnion(a?: boolean | number) {
  if (!a) {
  }
}

function TakeNumber(n: number) {
}

function TestUnion() {
  let bn: boolean | number = 999;
  bn = true;
  TakeOptionalUnion(bn);
  TakeOptionalUnion(888);
  TakeOptionalUnion(true);

  let b: boolean = bn;
  TakeNumber(bn);
}
