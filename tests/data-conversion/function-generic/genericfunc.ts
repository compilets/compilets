class Item<T> {
  value: T;
}

function Passthrough<T>(value: T) {
  return value;
}

function TestGenericFunction() {
  const passStr = Passthrough<string>;
  let str = Passthrough('text');
  str = passStr(str);

  let union: number | boolean | undefined;
  union = Passthrough(union);

  let optional: number | undefined;
  optional = Passthrough(optional);
}
