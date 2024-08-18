interface NumberMember {
  n: number;
}

interface SameNumberMember {
  n: number;
}

interface InterfaceMember {
  i: NumberMember;
};

function TestInterface() {
  let hasNumber: NumberMember | undefined;
  let hasObject: InterfaceMember | undefined;
}
