void TestExpression() {
  double a = 0;
  a++;
  --a;
  a ? 89 : 64;
  double b = a ? 89 : 64;
  (123 + 456) / (789 + -a);
  true;
  bool condition = false;
  if (condition) a++; else a--;
  if (b == 89) {
    a = 64;
  } else if (b == 64) {
    a = 89;
  } else {
    a = 8964;
  }
}
