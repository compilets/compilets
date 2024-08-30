#include "runtime/array.h"
#include "runtime/function.h"
#include "runtime/string.h"
#include "runtime/union.h"

namespace {

template<typename T>
class Item : public compilets::Object {
 public:
  compilets::OptionalCppgcMemberType<T> value;

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TracePossibleMember(visitor, value);
  }

  virtual ~Item() = default;
};

template<typename T>
compilets::ValueType<T> Passthrough(compilets::ValueType<T> value) {
  return value;
}

template<typename U>
compilets::ValueType<U> GetValue(Item<U>* item) {
  return compilets::GetOptionalValue(item->value);
}

template<typename U>
compilets::Array<cppgc::Member<Item<U>>>* CreateItems() {
  return compilets::MakeArray<cppgc::Member<Item<U>>>({compilets::MakeObject<Item<U>>()});
}

void TestGenericFunction() {
  compilets::Function<compilets::String(compilets::String)>* passStr = compilets::MakeFunction<compilets::String(compilets::String)>(Passthrough<compilets::String>);
  compilets::String str = Passthrough<compilets::String>(u"text");
  str = passStr->value()(str);
  compilets::Union<double, bool, std::monostate> onion = std::monostate{};
  onion = Passthrough<compilets::Union<double, bool, std::monostate>>(onion);
  std::optional<double> optional;
  optional = Passthrough<std::optional<double>>(optional);
  compilets::Array<cppgc::Member<Item<compilets::String>>>* items = CreateItems<compilets::String>();
  Item<compilets::String>* item = compilets::MakeObject<Item<compilets::String>>();
  item->value = Passthrough<std::optional<compilets::String>>(item->value);
  item->value = GetValue<compilets::String>(item);
  compilets::Array<cppgc::Member<Item<Item<compilets::String>>>>* itemItems = CreateItems<Item<compilets::String>>();
  Item<Item<compilets::String>>* itemItem = compilets::MakeObject<Item<Item<compilets::String>>>();
  itemItem->value = Passthrough<Item<compilets::String>>(itemItem->value);
  itemItem->value = GetValue<Item<compilets::String>>(itemItem);
  item = Passthrough<Item<compilets::String>>(itemItem->value);
  item = GetValue<Item<compilets::String>>(itemItem);
}

}  // namespace
