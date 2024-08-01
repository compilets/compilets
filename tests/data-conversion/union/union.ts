function TakeOptionalUnion(a?: boolean | number) {
}

function TestUnion() {
  let a: boolean | number = 999;
  a = true;
  TakeOptionalUnion(a);
  TakeOptionalUnion(888);
  TakeOptionalUnion(true);
}
