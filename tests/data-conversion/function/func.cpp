#include "runtime/function.h"
#include "runtime/runtime.h"

double Simple(double i);
compilets::Function<double()>* TakeCallback(double input, compilets::Function<double(double i)>* callback);
class SaveCallback;
void TestLocalFunction();

double Simple(double i) {
  return i;
}

compilets::Function<double()>* TakeCallback(double input, compilets::Function<double(double i)>* callback) {
  return compilets::MakeFunction([=]() -> double {
    return (*callback)(input);
  });
}

class SaveCallback : public compilets::Object {
 public:
  compilets::Function<double(double i)>* callback;

  SaveCallback(compilets::Function<double(double i)>* callback) {
    this->callback = callback;
  }

  void Trace(cppgc::Visitor* visitor) const override {
    visitor->Trace(callback);
  }

  virtual ~SaveCallback() = default;
};

void TestLocalFunction() {
  compilets::Function<double(double a)>* add = compilets::MakeFunction([=](double a) -> double {
    return a + 1;
  });
  compilets::Function<void()>* arrow = compilets::MakeFunction([=]() -> void {});
  Simple(1234);
  (*add)(8963);
  (*arrow)();
  compilets::Function<double()>* passLambda = TakeCallback(1234, add);
  compilets::Function<double()>* passFunction = TakeCallback(1234, compilets::MakeFunction(Simple));
  SaveCallback* saveLambda = compilets::MakeObject<SaveCallback>(add);
  SaveCallback* saveFunction = compilets::MakeObject<SaveCallback>(compilets::MakeFunction(Simple));
  (*saveLambda->callback.Get())(0x8964);
}
