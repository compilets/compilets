#include "runtime/function.h"

double Simple(double i);
compilets::Function<double()>* TakeCallback(double input, compilets::Function<double(double i)>* callback);
void TestLocalFunction();

double Simple(double i) {
  return i;
}

compilets::Function<double()>* TakeCallback(double input, compilets::Function<double(double i)>* callback) {
  return compilets::MakeFunction([=]() -> double {
    return (*callback)(input);
  });
}

void TestLocalFunction() {
  compilets::Function<double(double a)>* add = compilets::MakeFunction([=](double a) -> double {
    return a + 1;
  });
  compilets::Function<void()>* arrow = compilets::MakeFunction([=]() -> void {});
  Simple(1234);
  (*add)(8963);
  (*arrow)();
  compilets::Function<double()>* passLambda = TakeCallback(1234, add);
  compilets::Function<double()>* passFunction = TakeCallback(1234, Simple);
}
