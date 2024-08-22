#include "runtime/type_traits.h"

void TestExpression() {
  if (true) {}
  if (1 > 2) {}
  std::optional<bool> optionalBoolean;
  if (compilets::IsTrue(optionalBoolean)) {}
}
