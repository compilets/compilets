#include "runtime/array.h"

void TestArray() {
  compilets::Array<double>* a = nullptr;
  compilets::Array<double>* numArr = compilets::MakeArray<double>({1, 2, 3, 4});
}
