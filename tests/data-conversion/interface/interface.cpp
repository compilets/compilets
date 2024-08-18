#include "runtime/object.h"

struct Interface1 : public compilets::Object {
  double n;
};

struct Interface2 : public compilets::Object {
  cppgc::Member<compilets::generated::Interface1> i;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, i);
  }

  virtual ~Interface2() = default;
};

void TestInterface() {
  compilets::generated::Interface1* hasNumber = nullptr;
  compilets::generated::Interface2* hasObject = nullptr;
}
