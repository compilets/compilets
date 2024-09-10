function TestExpression() {
  if (true) {}
  let optionalBoolean: boolean | undefined;
  if (optionalBoolean) {}
  if (optionalBoolean || 2 > 1) {}

  if (1 > 2) {}
  if ('1' > '2') {}
  if ('1' === '1') {}
}
