#include "runtime/string.h"

namespace {

void TestExpression() {
  if (true) {}
  std::optional<bool> optionalBoolean;
  if (compilets::IsTrue(optionalBoolean)) {}
  if (compilets::IsTrue(optionalBoolean) || 2 > 1) {}
  if (1 > 2) {}
  if (compilets::String(u"1") > u"2") {}
  if (compilets::StrictEqual(compilets::String(u"1"), u"1")) {}
}

}  // namespace
