#include "runtime/runtime.h"

class Prop;
class Owner;
void TestNested();

class Prop : public compilets::Object {
};

class Owner : public compilets::Object {
 public:
  Owner(Prop* prop) {
    this->prop1 = prop;
    this->prop2 = prop;
  }

  void Trace(cppgc::Visitor* visitor) const override {
    visitor->Trace(prop1);
    visitor->Trace(prop2);
  }

  virtual ~Owner() = default;

 private:
  cppgc::Member<Prop> prop1;

  cppgc::Member<Prop> prop2;
};

void TestNested() {
  Owner* o = compilets::MakeObject<Owner>();
  o->prop1 = o->prop2.Get();
}
