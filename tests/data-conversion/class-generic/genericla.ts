class Generic<T> {
  member: T;
}

function TestGenericClass() {
  const c = new Generic<number>;
}
