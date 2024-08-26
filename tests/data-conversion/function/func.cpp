#include "runtime/function.h"

double Simple(double i);
double OptionalArg(std::optional<double> arg);
compilets::Function<double()>* TakeCallback(double input, compilets::Function<double(double)>* callback);
class SaveCallback;
void TestLocalFunction();

double Simple(double i) {
  return i;
}

double OptionalArg(std::optional<double> arg) {
  if (compilets::IsTrue(arg)) {
    return arg.value();
  } else {
    return 8964;
  }
}

compilets::Function<double()>* TakeCallback(double input, compilets::Function<double(double)>* callback) {
  return compilets::MakeFunction<double()>([=]() -> double {
    return callback->value()(input);
  }, callback);
}

class SaveCallback : public compilets::Object {
 public:
  cppgc::Member<compilets::Function<double(double)>> callback;

  SaveCallback(compilets::Function<double(double)>* callback) {
    this->callback = callback;
  }

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, callback);
  }

  virtual ~SaveCallback() = default;
};

void TestLocalFunction() {
  compilets::Function<double(double)>* add = compilets::MakeFunction<double(double)>([=](double a) -> double {
    return a + 1;
  });
  compilets::Function<void()>* arrow = compilets::MakeFunction<void()>([=]() -> void {});
  Simple(1234);
  add->value()(8963);
  arrow->value()();
  compilets::Function<double()>* passLambda = TakeCallback(1234, add);
  compilets::Function<double()>* passFunction = TakeCallback(1234, compilets::MakeFunction<double(double)>(Simple));
  SaveCallback* saveLambda = compilets::MakeObject<SaveCallback>(add);
  SaveCallback* saveFunction = compilets::MakeObject<SaveCallback>(compilets::MakeFunction<double(double)>(Simple));
  saveLambda->callback->value()(0x8964);
}
