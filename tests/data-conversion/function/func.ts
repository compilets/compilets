function Simple(i: number) {
  return i;
}
function TakeCallback(input: number, callback: (i: number) => number) {
  return () => callback(input);
}
function TestLocalFunction() {
  let add = function(a: number) { return a + 1 };
  let arrow = () => {};
  Simple(1234);
  add(8963);
  arrow();
  const passLambda = TakeCallback(1234, add);
  const passFunction = TakeCallback(1234, Simple);
}
