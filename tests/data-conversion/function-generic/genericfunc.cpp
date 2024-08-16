#include "runtime/function.h"
#include "runtime/object.h"
#include "runtime/string.h"
#include "runtime/union.h"

template<typename T>
class Item;
template<typename T>
compilets::ValueType<T> Passthrough(compilets::ValueType<T> value);
void TestGenericFunction();

template<typename T>
class Item : public compilets::Object {
 public:
  compilets::CppgcMemberType<T> value;

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TracePossibleMember(visitor, value);
  }

  virtual ~Item() = default;
};

template<typename T>
compilets::ValueType<T> Passthrough(compilets::ValueType<T> value) {
  return value;
}

void TestGenericFunction() {
  compilets::Function<compilets::String(compilets::String)>* passStr = compilets::MakeFunction<compilets::String(compilets::String)>(Passthrough<compilets::String>);
  compilets::String str = Passthrough<compilets::String>(u"text");
  str = passStr->value()(str);
  compilets::Union<double, bool, std::monostate> union;
  union = Passthrough<compilets::Union<double, bool, std::monostate>>(union);
  std::optional<double> optional;
  optional = Passthrough<double>(optional);
}
