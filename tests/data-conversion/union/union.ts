function TakeOptionalUnion(a?: boolean | number) {
}

function TestUnion() {
  let bn: boolean | number = 999;
  bn = true;
  TakeOptionalUnion(bn);
  TakeOptionalUnion(888);
  TakeOptionalUnion(true);
}
