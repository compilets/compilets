#include "runtime/object.h"

template<typename T>
class Generic;
void TestGenericClass();

template<typename T>
class Generic : public compilets::Object {
 public:
  T member;

  virtual ~Generic() = default;
};

void TestGenericClass() {
  Generic<double>* c = compilets::MakeObject<Generic<double>>();
}
