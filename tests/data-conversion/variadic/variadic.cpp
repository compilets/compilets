#include "runtime/array.h"
#include "runtime/function.h"
#include "runtime/object.h"
#include "runtime/union.h"

class VariadicArgsMethod;
void VariadicArgs(bool arg, compilets::Array<double>* args);
void TestVariadicArgs();

class VariadicArgsMethod : public compilets::Object {
 public:
  void method(compilets::Array<double>* args) {}
};

void VariadicArgs(bool arg, compilets::Array<double>* args) {}

void TestVariadicArgs() {
  compilets::Function<void(bool, compilets::Array<double>*)>* variadicFuncRef = compilets::MakeFunction<void(bool, compilets::Array<double>*)>(VariadicArgs);
  variadicFuncRef->value()(true, compilets::MakeArray<double>({1, 2, 3, 4}));
  compilets::Function<void(compilets::Array<double>*)>* variadicArrow = compilets::MakeFunction<void(compilets::Array<double>*)>([=](compilets::Array<double>* args) -> void {});
  variadicArrow->value()(compilets::MakeArray<double>({1, 2, 3, 4}));
  std::variant<double, bool, std::monostate> a = static_cast<double>(123);
  VariadicArgs(std::get<bool>(a), compilets::MakeArray<double>({std::get<double>(a), std::get<double>(a)}));
}
