function simple(a = 1, b = true) {
  return b ? a : 2;
}
function complex(input: string, callback: (input: string) => number) {
  return () => callback(input);
}
function TestLocalFunction() {
  let func = function(a: string, b: string) { return a + b };
  let arrow = () => {};
}
