function TestGlobals() {
  process.exit(0);
  let processRef = process;
  processRef.exit();
}
