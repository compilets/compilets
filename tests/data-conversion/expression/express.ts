function TestExpression() {
  if (true) {}
  if (1 > 2) {}
  let optionalBoolean: boolean | undefined;
  if (optionalBoolean) {}
  if (optionalBoolean || 2 > 1) {}
}
