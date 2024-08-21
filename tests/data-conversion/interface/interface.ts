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
}

interface ObjectMember {
  obj: {name: string};
}

function TestInterface() {
  let hasNumber = {n: 1};
  let hasObject = {i: hasNumber};
  let hasFunction: FunctionMember | undefined;
  let twoNumber = {m: 89, n: 64};
  let hasLiteral = {obj: {name: 'tiananmen'}};
}
