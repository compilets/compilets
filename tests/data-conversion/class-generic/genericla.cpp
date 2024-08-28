#include "runtime/array.h"
#include "runtime/union.h"

class Item;
template<typename T, typename U>
class Wrapper;
void TestGenericClass();

class Item : public compilets::Object {
};

template<typename T, typename U>
class Wrapper : public compilets::Object {
 public:
  compilets::CppgcMemberType<T> member;
  compilets::OptionalCppgcMemberType<T> optionalMember;
  compilets::Union<compilets::CppgcMemberType<T>, compilets::CppgcMemberType<U>> unionMember;
  compilets::Union<compilets::CppgcMemberType<T>, compilets::CppgcMemberType<U>, std::monostate> optionalUnionMember;
  cppgc::Member<compilets::Array<compilets::CppgcMemberType<T>>> arrayMember = compilets::MakeArray<compilets::CppgcMemberType<T>>({});

  virtual void method() {
    compilets::ValueType<T> m = this->member;
    m = compilets::GetOptionalValue(this->optionalMember);
    m = std::get<compilets::CppgcMemberType<T>>(this->unionMember);
    m = std::get<compilets::CppgcMemberType<T>>(this->optionalUnionMember);
    m = this->arrayMember->value()[0];
  }

  virtual void take(compilets::ValueType<T> value) {
    this->member = value;
    this->optionalMember = value;
    this->unionMember = value;
    this->optionalUnionMember = value;
    this->arrayMember = compilets::MakeArray<compilets::CppgcMemberType<T>>({value});
  }

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TracePossibleMember(visitor, member);
    compilets::TracePossibleMember(visitor, optionalMember);
    compilets::TracePossibleMember(visitor, unionMember);
    compilets::TracePossibleMember(visitor, optionalUnionMember);
    compilets::TraceMember(visitor, arrayMember);
  }

  virtual ~Wrapper() = default;
};

void TestGenericClass() {
  Wrapper<double, bool>* primitive = compilets::MakeObject<Wrapper<double, bool>>();
  primitive->take(123);
  primitive->method();
  double n = primitive->member;
  n = primitive->optionalMember.value();
  n = std::get<double>(primitive->unionMember);
  n = std::get<double>(primitive->optionalUnionMember);
  n = primitive->arrayMember->value()[0];
  primitive->take(n);
  std::optional<double> optionalNumber = primitive->optionalMember;
  compilets::Union<double, bool> numberOrBool = primitive->unionMember;
  compilets::Union<double, bool, std::monostate> numberOrBoolOrNull = primitive->optionalUnionMember;
  compilets::Array<double>* numberArray = primitive->arrayMember;
  Wrapper<Item, bool>* nested = compilets::MakeObject<Wrapper<Item, bool>>();
  nested->take(compilets::MakeObject<Item>());
  nested->method();
  Item* item = nested->member;
  item = nested->optionalMember;
  item = std::get<cppgc::Member<Item>>(nested->unionMember);
  item = std::get<cppgc::Member<Item>>(nested->optionalUnionMember);
  item = nested->arrayMember->value()[0];
  nested->take(item);
  Item* optionalItem = nested->optionalMember;
  compilets::Union<bool, Item*> itemOrBool = nested->unionMember;
  compilets::Union<bool, Item*, std::monostate> itemOrBoolOrNull = nested->optionalUnionMember;
  compilets::Array<cppgc::Member<Item>>* itemArray = nested->arrayMember;
}
