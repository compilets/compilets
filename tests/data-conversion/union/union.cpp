#include <optional>
#include <variant>

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a);
void TestUnion();

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a) {}

void TestUnion() {
  std::variant<double, bool> a = static_cast<double>(999);
  a = true;
  TakeOptionalUnion(a);
  TakeOptionalUnion(static_cast<double>(888));
  TakeOptionalUnion(true);
}
