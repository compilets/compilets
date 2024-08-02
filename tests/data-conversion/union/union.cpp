#include <optional>

#include "runtime/union.h"

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a);
void TestUnion();

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a) {}

void TestUnion() {
  std::variant<double, bool> bn = static_cast<double>(999);
  bn = true;
  TakeOptionalUnion(compilets::CastVariant(bn));
  TakeOptionalUnion(static_cast<double>(888));
  TakeOptionalUnion(true);
}
