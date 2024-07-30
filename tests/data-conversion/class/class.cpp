#include "runtime/runtime.h"

class Empty;
class EmptyConstructor;
class Simple;
void TestClass();

class Empty : public compilets::Object {
};

class EmptyConstructor : public compilets::Object {
 public:
  EmptyConstructor() {}
};

class Simple : public compilets::Object {
 public:
  Simple(bool a, double b = 123) {
    double c = a ? b : 456;
  }

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
