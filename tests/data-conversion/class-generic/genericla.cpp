#include "runtime/object.h"
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

  virtual void method() {
    compilets::ValueType<T> m = this->member;
    m = compilets::GetOptionalValue(this->optionalMember);
    m = std::get<compilets::CppgcMemberType<T>>(this->unionMember);
  }

  virtual ~Wrapper() = default;
};

void TestGenericClass() {
  Wrapper<double, bool>* primitive = compilets::MakeObject<Wrapper<double, bool>>();
  double n = primitive->member;
  n = primitive->optionalMember.value();
  n = std::get<double>(primitive->unionMember);
  std::optional<double> optionalNumber = primitive->optionalMember;
  compilets::Union<double, bool> numberOrBool = primitive->unionMember;
  Wrapper<Item, bool>* nested = compilets::MakeObject<Wrapper<Item, bool>>();
  Item* item = nested->member;
  item = nested->optionalMember;
  item = std::get<cppgc::Member<Item>>(nested->unionMember);
  Item* optionalItem = nested->optionalMember;
  compilets::Union<bool, Item*> itemOrBool = nested->unionMember;
}
