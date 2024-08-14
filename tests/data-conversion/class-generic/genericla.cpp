#include "runtime/object.h"
#include "runtime/union.h"

class Item;
template<typename T>
class Wrapper;
void TestGenericClass();

class Item : public compilets::Object {
};

template<typename T>
class Wrapper : public compilets::Object {
 public:
  compilets::CppgcMemberT<T> member;

  compilets::OptionalCppgcMemberT<T> optionalMember;

  compilets::Union<bool, compilets::CppgcMemberT<T>> unionMember;

  virtual ~Wrapper() = default;
};

void TestGenericClass() {
  Wrapper<double>* primitive = compilets::MakeObject<Wrapper<double>>();
  double n = primitive->member;
  n = primitive->optionalMember.value();
  std::optional<double> optionalNumber = primitive->optionalMember;
  compilets::Union<double, bool> numberOrBool = primitive->unionMember;
  Wrapper<Item>* nested = compilets::MakeObject<Wrapper<Item>>();
  Item* item = nested->member;
  item = nested->optionalMember;
  Item* optionalItem = nested->optionalMember;
  compilets::Union<bool, Item*> itemOrBool = nested->unionMember;
}
