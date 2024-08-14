class Item {}

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

  const nested = new Wrapper<Item>;

  let item = nested.member;
  item = nested.optionalMember!;

  const optionalItem = nested.optionalMember;
  const itemOrBool = nested.unionMember;
}
