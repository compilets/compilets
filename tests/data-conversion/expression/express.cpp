void TestExpression();

void TestExpression() {
  double a = 0;
  a++;
  --a;
  a ? 89 : 64;
  double b = a ? 89 : 64;
  (123 + 456) / (789 + -a);
  true;
  false;
}
