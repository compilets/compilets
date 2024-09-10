class VariadicArgsMethod {
  method(...args: number[]) {
  }
}

function VariadicArgs(arg: boolean, ...args: number[]) {
}

function TestVariadicArgs() {
  let variadicFuncRef = VariadicArgs;
  variadicFuncRef(true, 1, 2, 3, 4);

  let variadicArrow = (...args: number[]) => {};
  variadicArrow(1, 2, 3, 4);

  let a: boolean | number | undefined = 123;
  VariadicArgs(a as unknown as boolean, a as number, a as number);
}
