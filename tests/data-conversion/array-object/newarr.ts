function TestArrayObject() {
  const tenElements = new Array<number>(10);
  const oneElement = new Array<number>(1.23);
  const threeElements = new Array(1, 2, 3);

  const arrayOfOneElement = Array.of(10);

  Array.isArray(tenElements);
  Array.isArray(123);
}
