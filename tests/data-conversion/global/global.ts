function TestGlobals() {
  process.exit(0);
  let processRef = process;
  processRef.exit();
  console.log('text', 123, process);

  let pi = Math.PI;
  Math.floor(123);
}
