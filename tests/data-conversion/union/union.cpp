#include "runtime/union.h"

void TakeOptionalUnion(compilets::Union<double, bool, std::monostate> a);
void TakeNumber(double n);
compilets::Union<double, bool> ReturnUnion();
void TestUnion();

void TakeOptionalUnion(compilets::Union<double, bool, std::monostate> a) {
  if (!!std::holds_alternative<std::monostate>(a)) {}
}

void TakeNumber(double n) {}

compilets::Union<double, bool> ReturnUnion() {
  return static_cast<double>(123);
}

void TestUnion() {
  compilets::Union<double, bool> bn = static_cast<double>(999);
  bn = true;
  TakeOptionalUnion(bn);
  TakeOptionalUnion(static_cast<double>(888));
  TakeOptionalUnion(true);
  compilets::Union<double, bool> nb = ReturnUnion();
  bn = ReturnUnion();
  bn = nb;
  bool b = std::get<bool>(bn);
  TakeNumber(std::get<double>(bn));
  double numberCast = std::get<double>(bn);
}
