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

  take(value: T) {
    this.member = value;
    this.optionalMember = value;
    this.unionMember = value;
    this.optionalUnionMember = value;
    this.arrayMember = [value];
  }
}

function TestGenericClass() {
  const primitive = new Wrapper<number>;
  primitive.take(123);
  primitive.method();

  let n = primitive.member;
  n = primitive.optionalMember!;
  n = primitive.unionMember as number;
  n = primitive.optionalUnionMember as number;
  n = primitive.arrayMember[0];
  primitive.take(n);

  const optionalNumber = primitive.optionalMember;
  const numberOrBool = primitive.unionMember;
  const numberOrBoolOrNull = primitive.optionalUnionMember;
  const numberArray = primitive.arrayMember;

  const nested = new Wrapper<Item>;
  nested.take(new Item);
  nested.method();

  let item = nested.member;
  item = nested.optionalMember!;
  item = nested.unionMember as Item;
  item = nested.optionalUnionMember as Item;
  item = nested.arrayMember[0];
  nested.take(item);

  const optionalItem = nested.optionalMember;
  const itemOrBool = nested.unionMember;
  const itemOrBoolOrNull = nested.optionalUnionMember;
  const itemArray = nested.arrayMember;
}
