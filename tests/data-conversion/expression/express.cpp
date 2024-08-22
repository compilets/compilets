#include "runtime/string.h"

void TestExpression() {
  if (true) {}
  std::optional<bool> optionalBoolean;
  if (compilets::IsTrue(optionalBoolean)) {}
  if (compilets::IsTrue(optionalBoolean) || 2 > 1) {}
  if (1 > 2) {}
  if (compilets::String(u"1") > 2) {}
}
