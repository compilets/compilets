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
  static double count;

  NonSimple(bool a, double b = 123) {
    double c = a ? b : 456;
    NonSimple::count++;
  }

  virtual ~NonSimple() = default;

 protected:
  bool method() {
    return true;
  }

 private:
  std::string prop = "For a breath I tarry.";
};

double NonSimple::count = 0;

void TestClass() {
  NonSimple* s = compilets::MakeObject<NonSimple>(false);
  bool r = s->method();
  NonSimple::count == 1;
}
