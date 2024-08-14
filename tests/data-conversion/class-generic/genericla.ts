class Item {}

class Wrapper<T extends {}, U = boolean> {
  member: T;
  optionalMember?: T;
  unionMember: T | U;

  method() {
    let m = this.member;
    m = this.optionalMember!;
    m = this.unionMember as T;
  }
}

function TestGenericClass() {
  const primitive = new Wrapper<number>;

  let n = primitive.member;
  n = primitive.optionalMember!;
  n = primitive.unionMember as number;

  const optionalNumber = primitive.optionalMember;
  const numberOrBool = primitive.unionMember;

  const nested = new Wrapper<Item>;

  let item = nested.member;
  item = nested.optionalMember!;
  item = nested.unionMember as Item;

  const optionalItem = nested.optionalMember;
  const itemOrBool = nested.unionMember;
}
