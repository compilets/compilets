#include <optional>
#include <variant>

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a);
void TestUnion();

void TakeOptionalUnion(std::variant<double, bool, std::monostate> a) {}

void TestUnion() {
  std::variant<double, bool> a = 999;
  a = true;
  TakeOptionalUnion(a);
  TakeOptionalUnion(888);
  TakeOptionalUnion(true);
}
