function TestPersistent() {
  // compilets: persistent
  let persistent = [ 1, 2, 3 ];
  let value: number[] = persistent;
  persistent = null;
}
