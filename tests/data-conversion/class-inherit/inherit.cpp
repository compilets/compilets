#include "runtime/object.h"

class Prop;
class Base;
class Derived;
class NotDerived;
void TestInheritance();

class Prop : public compilets::Object {
};

class Base : public compilets::Object {
 public:
  cppgc::Member<Prop> prop;

  Base(Prop* prop) {
    this->prop = prop;
  }

  virtual void method(Prop* arg) {}

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, prop);
  }

  virtual ~Base() = default;
};

class Derived : public Base {
 public:
  cppgc::Member<Prop> childProp;

  Derived() : Base(compilets::MakeObject<Prop>()) {}

  void method(Prop* arg) override {
    Base::method(arg);
  }

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, childProp);
    Base::Trace(visitor);
  }

  virtual ~Derived() = default;
};

class NotDerived : public compilets::Object {
};

void TestInheritance() {
  Base* base = compilets::MakeObject<Derived>();
}
