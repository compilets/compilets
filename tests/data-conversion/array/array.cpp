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

  void Trace(cppgc::Visitor* visitor) const override {
    TraceHelper(visitor, items);
  }

  virtual ~Collection() = default;
};

void TestArray() {
  compilets::Array<double>* a = nullptr;
  compilets::Array<double>* numArr = compilets::MakeArray<double>({1, 2, 3, 4});
  compilets::Array<Item*>* eleArr = compilets::MakeArray<Item*>({compilets::MakeObject<Item>(), compilets::MakeObject<Item>()});
  Collection* c = compilets::MakeObject<Collection>();
  c->items = compilets::CastArray(eleArr);
  eleArr = compilets::CastArray(c->items);
  compilets::Array<Item*>* arr = compilets::CastArray(c->items);
}
