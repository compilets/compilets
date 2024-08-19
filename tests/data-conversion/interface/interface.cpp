#include "runtime/function.h"
#include "runtime/object.h"

namespace compilets::generated {

struct Interface1 : public compilets::Object {
  double n;
};

struct Interface2 : public compilets::Object {
  cppgc::Member<Interface1> i;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, i);
  }

  virtual ~Interface2() = default;
};

struct Interface3 : public compilets::Object {
  cppgc::Member<compilets::Function<Interface1*()>> method;

  cppgc::Member<compilets::Function<double(Interface1*)>> func;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, method);
    TraceMember(visitor, func);
  }

  virtual ~Interface3() = default;
};

struct Interface4 : public compilets::Object {
  double m;

  double n;
};

}  // namespace compilets::generated

void TestInterface() {
  compilets::generated::Interface1* hasNumber = nullptr;
  compilets::generated::Interface2* hasObject = nullptr;
  compilets::generated::Interface3* hasFunction = nullptr;
  compilets::generated::Interface4* twoNumber = nullptr;
}
