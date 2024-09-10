function TestPersistent() {
  // compilets: persistent
  let persistent: number[] | undefined = [ 1, 2, 3 ];
  let value: number[] = persistent;
  persistent = undefined;
}
