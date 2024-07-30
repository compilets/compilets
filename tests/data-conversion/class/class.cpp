#include "runtime/object.h"

class Empty;
class EmptyConstructor;
class NonSimple;
void TestClass();

class Empty : public compilets::Object {
};

class EmptyConstructor : public compilets::Object {
 public:
  EmptyConstructor() {}
};

class NonSimple : public compilets::Object {
 public:
  NonSimple(bool a, double b = 123) {
    double c = a ? b : 456;
  }

  virtual ~NonSimple() = default;

 protected:
  bool method() {
    return true;
  }

 private:
  std::string prop = "For a breath I tarry.";
};

void TestClass() {
  NonSimple* s = compilets::MakeObject<NonSimple>(false);
  bool r = s->method();
}
