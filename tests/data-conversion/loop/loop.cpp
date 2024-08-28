namespace {

void TestLoop() {
  do {
    1 + 2;
    3 + 4;
  } while (true);
  while (1 + 2) {
    3 + 4;
  }
  for (; ; ) {
    123;
  }
  for (double i = 0; i < 10; ++i) {
    u"str";
  }
}

}  // namespace
