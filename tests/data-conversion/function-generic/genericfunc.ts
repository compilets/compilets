function Passthrough<T>(value: T) {
  return value;
}

function TestGenericFunction() {
  const str = Passthrough('text');
  const passStr = Passthrough<string>;
  str = passStr(str);
}
