class MethodClosure {
  prop = 8964;

  method() {
    return () => this.prop;
  }
}

function TestFunctionClosure() {
  let n = 123;
  let takeNumber = () => { return n; }

  let arr = [1, 2, 3];
  let takeArray = () => { return arr; }

  let uni: number | number[];
  let takeUnion = () => { return uni as number[] };
}
