#include <optional>

#include "runtime/object.h"
#include "runtime/union.h"

template<typename T>
class Wrapper;
void TestGenericClass();

template<typename T>
class Wrapper : public compilets::Object {
 public:
  T member;

  std::optional<T> optionalMember;

  std::variant<bool, T> unionMember;

  virtual ~Wrapper() = default;
};

void TestGenericClass() {
  Wrapper<double>* primitive = compilets::MakeObject<Wrapper<double>>();
  double n = primitive->member;
  n = primitive->optionalMember.value();
  std::optional<double> optionalNumber = primitive->optionalMember;
  std::variant<double, bool> numberOrBool = primitive->unionMember;
}
