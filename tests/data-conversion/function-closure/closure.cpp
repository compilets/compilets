#include "runtime/array.h"
#include "runtime/function.h"
#include "runtime/object.h"
#include "runtime/union.h"

class MethodClosure;
void TestFunctionClosure();

class MethodClosure : public compilets::Object {
 public:
  double prop = 8964;

  virtual compilets::Function<double()>* method() {
    return compilets::MakeFunction<double()>([=]() -> double {
      return this->prop;
    }, this);
  }

  virtual ~MethodClosure() = default;
};

void TestFunctionClosure() {
  double n = 123;
  compilets::Function<double()>* takeNumber = compilets::MakeFunction<double()>([=]() -> double {
    return n;
  });
  compilets::Array<double>* arr = compilets::MakeArray<double>({1, 2, 3});
  compilets::Function<compilets::Array<double>*()>* takeArray = compilets::MakeFunction<compilets::Array<double>*()>([=]() -> compilets::Array<double>* {
    return arr;
  }, arr);
  compilets::Union<double, compilets::Array<double>*> uni;
  compilets::Function<compilets::Array<double>*()>* takeUnion = compilets::MakeFunction<compilets::Array<double>*()>([=]() -> compilets::Array<double>* {
    return std::get<compilets::Array<double>*>(uni);
  }, uni.GetObject());
}
