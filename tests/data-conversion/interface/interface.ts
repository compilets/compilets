function TestInterface() {
  let hasNumber = {n: 1};
  let hasObject = {i: hasNumber};
  let hasFunction = {
    method: () => hasNumber,
    func: function(m: {n: number}) { return m.n },
  };
  let twoNumber = {m: 89, n: 64};
  let hasLiteral = {obj: {name: 'tiananmen'}};
}
