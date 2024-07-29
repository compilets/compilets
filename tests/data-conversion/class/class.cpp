#include "runtime/runtime.h"

class Empty : public cppgc::GarbageCollected<Empty> {
 public:
  void Trace(cppgc::Visitor* visitor) const {}
};

class EmptyConstructor : public cppgc::GarbageCollected<EmptyConstructor> {
 public:
  EmptyConstructor() {}

  void Trace(cppgc::Visitor* visitor) const {}
};

class Simple : public cppgc::GarbageCollected<Simple> {
 public:
  Simple(bool a, double b = 123) {
    double c = a ? b : 456;
  }

  void Trace(cppgc::Visitor* visitor) const {}

 protected:
  bool method() {
    return true;
  }

 private:
  std::string prop = "For a breath I tarry.";
};

void TestClass() {
  Simple* s = cppgc::MakeGarbageCollected<Simple>(compilets::GetAllocationHandle(), false);
  bool r = s->method();
}
