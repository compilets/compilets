function TakeOptionalUnion(a?: boolean | number) {
  if (!a) {
  }
}

function TakeNumber(n: number) {
}

function ReturnUnion(): boolean | number {
  return 123;
}

function TestUnion() {
  let bn: boolean | number = 999;
  bn = true;
  TakeOptionalUnion(bn);
  TakeOptionalUnion(888);
  TakeOptionalUnion(true);

  let nb: number | boolean = ReturnUnion();
  bn = ReturnUnion();
  bn = nb;

  let b: boolean = bn;
  TakeNumber(bn);

  let numberCast = bn as number;
}
