#include "runtime/math.h"
#include "runtime/number.h"

namespace {

void TestNumber() {
  double maxInt = compilets::NumberConstructor::MAX_SAFE_INTEGER;
  bool isInteger = compilets::NumberConstructor::isInteger(123);
  double number = compilets::Number(u"123");
  compilets::parseFloat(u"123");
  compilets::NumberConstructor::parseFloat(u"123");
  double pi = compilets::Math::PI;
  compilets::Math::floor(123);
}

}  // namespace
