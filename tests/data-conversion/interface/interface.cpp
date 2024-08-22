#include "runtime/function.h"
#include "runtime/string.h"

namespace compilets::generated {

struct Interface1;
struct Interface2;
struct Interface3;
struct Interface4;
struct Interface6;
struct Interface5;

struct Interface1 : public compilets::Object {
  Interface1(double n) : n(n) {}

  double n;
};

struct Interface2 : public compilets::Object {
  Interface2(Interface1* i) : i(i) {}

  cppgc::Member<Interface1> i;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, i);
  }

  virtual ~Interface2() = default;
};

struct Interface3 : public compilets::Object {
  Interface3(compilets::Function<Interface1*()>* method, compilets::Function<double(Interface1*)>* func) : method(method), func(func) {}

  cppgc::Member<compilets::Function<Interface1*()>> method;

  cppgc::Member<compilets::Function<double(Interface1*)>> func;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, method);
    TraceMember(visitor, func);
  }

  virtual ~Interface3() = default;
};

struct Interface4 : public compilets::Object {
  Interface4(double m, double n) : m(m), n(n) {}

  double m;

  double n;
};

struct Interface6 : public compilets::Object {
  Interface6(Interface5* obj) : obj(obj) {}

  cppgc::Member<Interface5> obj;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, obj);
  }

  virtual ~Interface6() = default;
};

struct Interface5 : public compilets::Object {
  Interface5(compilets::String name) : name(std::move(name)) {}

  compilets::String name;

  virtual ~Interface5() = default;
};

}  // namespace compilets::generated

void TestInterface() {
  compilets::generated::Interface1* hasNumber = compilets::MakeObject<compilets::generated::Interface1>(1);
  compilets::generated::Interface2* hasObject = compilets::MakeObject<compilets::generated::Interface2>(hasNumber);
  compilets::generated::Interface3* hasFunction = compilets::MakeObject<compilets::generated::Interface3>(compilets::MakeFunction<compilets::generated::Interface1*()>([=]() -> compilets::generated::Interface1* {
    return hasNumber;
  }, hasNumber), compilets::MakeFunction<double(compilets::generated::Interface1*)>([=](compilets::generated::Interface1* m) -> double {
    return m->n;
  }));
  compilets::generated::Interface4* twoNumber = compilets::MakeObject<compilets::generated::Interface4>(89, 64);
  compilets::generated::Interface6* hasLiteral = compilets::MakeObject<compilets::generated::Interface6>(compilets::MakeObject<compilets::generated::Interface5>(u"tiananmen"));
}
