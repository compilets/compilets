#include "runtime/function.h"
#include "runtime/object.h"

class Prop;
class Owner;
void TestNested();

class Prop : public compilets::Object {
};

class Owner : public compilets::Object {
 public:
  cppgc::Member<Prop> prop1;

  cppgc::Member<Prop> prop2;

  Owner(Prop* prop) {
    this->prop1 = prop;
    this->prop2 = prop;
  }

  virtual compilets::Function<Prop*()>* method() {
    return compilets::MakeFunction<Prop*()>([=]() -> Prop* {
      return this->prop1;
    }, this);
  }

  void Trace(cppgc::Visitor* visitor) const override {
    TraceHelper(visitor, prop1);
    TraceHelper(visitor, prop2);
  }

  virtual ~Owner() = default;
};

void TestNested() {
  Owner* o = compilets::MakeObject<Owner>(compilets::MakeObject<Prop>());
  o->prop1 = o->prop2;
  compilets::Function<Prop*()>* getter = o->method();
  Prop* p = getter->value()();
}
