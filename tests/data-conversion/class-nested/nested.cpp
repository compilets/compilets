#include "runtime/runtime.h"

class Prop : public cppgc::GarbageCollected<Prop> {
 public:
  void Trace(cppgc::Visitor* visitor) const {}
};

class Owner : public cppgc::GarbageCollected<Owner> {
 public:
  void Trace(cppgc::Visitor* visitor) const {
    visitor->Trace(prop1);
    visitor->Trace(prop2);
  }

 private:
  cppgc::Member<Prop> prop1;

  cppgc::Member<Prop> prop2;
};

void TestNested() {
  Owner* o = cppgc::MakeGarbageCollected<Owner>(compilets::GetAllocationHandle());
  o->prop1 = o->prop2.Get();
}
