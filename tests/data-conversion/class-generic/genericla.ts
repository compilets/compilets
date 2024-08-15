class Item {}

class Wrapper<T extends {}, U = boolean> {
  member: T;
  optionalMember?: T;
  unionMember: T | U;
  optionalUnionMember?: T | U;
  arrayMember: T[] = [];

  method() {
    let m = this.member;
    m = this.optionalMember!;
    m = this.unionMember as T;
    m = this.optionalUnionMember as T;
    m = this.arrayMember[0];
  }
}

function TestGenericClass() {
  const primitive = new Wrapper<number>;

  let n = primitive.member;
  n = primitive.optionalMember!;
  n = primitive.unionMember as number;
  n = primitive.optionalUnionMember as number;
  n = primitive.arrayMember[0];

  const optionalNumber = primitive.optionalMember;
  const numberOrBool = primitive.unionMember;
  const numberOrBoolOrNull = primitive.optionalUnionMember;
  const numberArray = primitive.arrayMember;

  const nested = new Wrapper<Item>;

  let item = nested.member;
  item = nested.optionalMember!;
  item = nested.unionMember as Item;
  item = nested.optionalUnionMember as Item;
  item = nested.arrayMember[0];

  const optionalItem = nested.optionalMember;
  const itemOrBool = nested.unionMember;
  const itemOrBoolOrNull = nested.optionalUnionMember;
  const itemArray = nested.arrayMember;
}
