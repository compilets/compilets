function Wrap(transform: (i: number) => number, fixed: number) {
  return () => transform(fixed);
}

function Passthrough(i: number) {
  return i;
}

const wrapped = Wrap(Passthrough, 8963);
wrapped();
