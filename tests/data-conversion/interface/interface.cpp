#include "runtime/object.h"

namespace compilets::generated {

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

struct Interface3 : public compilets::Object {
  cppgc::Member<compilets::Function<compilets::generated::Interface1*()>> method;

  cppgc::Member<compilets::Function<double(compilets::generated::Interface1*)>> func;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, method);
    TraceMember(visitor, func);
  }

  virtual ~Interface3() = default;
};

}  // namespace compilets::generated

void TestInterface() {
  compilets::generated::Interface1* hasNumber = nullptr;
  compilets::generated::Interface2* hasObject = nullptr;
  compilets::generated::Interface3* hasFunction = nullptr;
}
