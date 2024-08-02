function Wrap(transform: (i: number) => number, fixed: number) {
  return () => transform(fixed);
}

function Add(i: number) {
  return i + 1;
}

const wrapped = Wrap(Add, 8963);
const result = wrapped();
if (result == 8964)
  process.exit(0);
else
  process.exit(1);
