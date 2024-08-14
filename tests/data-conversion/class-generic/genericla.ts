class Wrapper<T> {
  member: T;
  optionalMember?: T;
  unionMember: T | boolean;
}

function TestGenericClass() {
  const primitive = new Wrapper<number>;
  let n = primitive.member;
  n = primitive.optionalMember!;
  const optionalNumber = primitive.optionalMember;
  const numberOrBool = primitive.unionMember;
}
