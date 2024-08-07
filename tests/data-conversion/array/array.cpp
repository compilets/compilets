#include "runtime/array.h"
#include "runtime/object.h"

class Item;
class Collection;
void TestArray();

class Item : public compilets::Object {
};

class Collection : public compilets::Object {
 public:
  cppgc::Member<compilets::Array<cppgc::Member<Item>>> items = compilets::MakeArray<cppgc::Member<Item>>({});

  cppgc::Member<compilets::Array<cppgc::Member<Item>>> maybeItems = compilets::MakeArray<cppgc::Member<Item>>({nullptr});

  void Trace(cppgc::Visitor* visitor) const override {
    TraceHelper(visitor, items);
    TraceHelper(visitor, maybeItems);
  }

  virtual ~Collection() = default;
};

void TestArray() {
  compilets::Array<double>* a = nullptr;
  compilets::Array<double>* numArr = compilets::MakeArray<double>({1, 2, 3, 4});
  compilets::Array<cppgc::Member<Item>>* eleArr = compilets::MakeArray<cppgc::Member<Item>>({compilets::MakeObject<Item>(), compilets::MakeObject<Item>()});
  Collection* c = compilets::MakeObject<Collection>();
  c->items = eleArr;
  eleArr = c->items.Get();
  compilets::Array<cppgc::Member<Item>>* items = c->items.Get();
  c->items = items;
  compilets::Array<cppgc::Member<Item>>* maybeItems = c->maybeItems.Get();
  c->maybeItems = maybeItems;
}
