#include "runtime/array.h"
#include "runtime/function.h"
#include "runtime/union.h"

void TestFunctionClosure() {
  double n = 123;
  compilets::Function<double()>* takeNumber = compilets::MakeFunction<double()>([=]() -> double {
    return n;
  });
  compilets::Array<double>* arr = compilets::MakeArray<double>({1, 2, 3});
  compilets::Function<compilets::Array<double>*()>* takeArray = compilets::MakeFunction<compilets::Array<double>*()>([=]() -> compilets::Array<double>* {
    return arr;
  }, arr);
  std::variant<double, compilets::Array<double>*> uni;
  compilets::Function<compilets::Array<double>*()>* takeUnion = compilets::MakeFunction<compilets::Array<double>*()>([=]() -> compilets::Array<double>* {
    return std::get<compilets::Array<double>*>(uni);
  }, compilets::GetObject(uni));
}
