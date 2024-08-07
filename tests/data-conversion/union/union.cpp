#include "runtime/union.h"

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a);
void TakeNumber(double n);
void TestUnion();

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a) {
  if (!std::holds_alternative<std::monostate>(a)) {}
}

void TakeNumber(double n) {}

void TestUnion() {
  std::variant<double, bool> bn = static_cast<double>(999);
  bn = true;
  TakeOptionalUnion(compilets::Cast<std::variant<double, bool, std::monostate>>(bn));
  TakeOptionalUnion(static_cast<double>(888));
  TakeOptionalUnion(true);
  bool b = std::get<bool>(bn);
  TakeNumber(std::get<double>(bn));
  double numberCast = std::get<double>(bn);
}
