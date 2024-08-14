#include <optional>

#include "runtime/array.h"
#include "runtime/object.h"
#include "runtime/union.h"

class Item;
class Collection;
void TestArray();

class Item : public compilets::Object {
};

class Collection : public compilets::Object {
 public:
  cppgc::Member<compilets::Array<cppgc::Member<Item>>> items = compilets::MakeArray<cppgc::Member<Item>>({});

  cppgc::Member<compilets::Array<cppgc::Member<Item>>> maybeItems = compilets::MakeArray<cppgc::Member<Item>>({nullptr});

  cppgc::Member<compilets::Array<compilets::Union<double, cppgc::Member<Item>>>> multiItems = compilets::MakeArray<compilets::Union<double, cppgc::Member<Item>>>({static_cast<double>(123)});

  void Trace(cppgc::Visitor* visitor) const override {
    TraceHelper(visitor, items);
    TraceHelper(visitor, maybeItems);
    TraceHelper(visitor, multiItems);
  }

  virtual ~Collection() = default;
};

void TestArray() {
  compilets::Array<double>* a = nullptr;
  a = compilets::MakeArray<double>({8964});
  double element = a->value()[0];
  std::optional<double> indexOptional;
  element = a->value()[static_cast<size_t>(indexOptional.value())];
  compilets::Union<double, bool> indexUnion = static_cast<double>(123);
  element = a->value()[static_cast<size_t>(std::get<double>(indexUnion))];
  compilets::Array<double>* numArr = compilets::MakeArray<double>({1, 2, 3, 4});
  compilets::Array<cppgc::Member<Item>>* eleArr = compilets::MakeArray<cppgc::Member<Item>>({compilets::MakeObject<Item>(), compilets::MakeObject<Item>()});
  double multiElement = (a->value()[0] == 1984 ? a : numArr)->value()[0];
  Collection* c = compilets::MakeObject<Collection>();
  c->items = eleArr;
  eleArr = c->items.Get();
  compilets::Array<cppgc::Member<Item>>* items = c->items.Get();
  c->items = items;
  compilets::Array<cppgc::Member<Item>>* maybeItems = c->maybeItems.Get();
  c->maybeItems = maybeItems;
  compilets::Array<compilets::Union<double, cppgc::Member<Item>>>* multiItems = c->multiItems.Get();
  c->multiItems = multiItems;
}
