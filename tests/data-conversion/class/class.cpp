#include "runtime/object.h"
#include "runtime/string.h"

namespace {

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

  virtual compilets::String method() {
    return this->prop;
  }

  virtual ~NonSimple() = default;

 private:
  compilets::String prop = u"For a breath I tarry.";
};

double NonSimple::count = 0;

void TestClass() {
  NonSimple* s = compilets::MakeObject<NonSimple>(false);
  if (NonSimple::count != 1) return;
  compilets::String r = s->method();
}

}  // namespace
