interface NumberMember {
  n: number;
}

interface SameNumberMember {
  n: number;
}

interface InterfaceMember {
  i: NumberMember;
};

interface FunctionMember {
  method(): NumberMember;
  func: (n: NumberMember) => number;
}

interface TwoNumber extends NumberMember {
  m: number;
};

function TestInterface() {
  let hasNumber: NumberMember | undefined;
  let hasObject: InterfaceMember | undefined;
  let hasFunction: FunctionMember | undefined;
  let twoNumber: TwoNumber | undefined;
}
