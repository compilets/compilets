#include "runtime/union.h"

void TestUndefined() {
  std::nullptr_t undef = std::nullptr;
  std::nullptr_t nul = std::nullptr;
  std::optional<double> orUndefined = 123;
  std::optional<double> orNull;
  std::variant<double, bool, std::monostate> optionalUnion;
}
