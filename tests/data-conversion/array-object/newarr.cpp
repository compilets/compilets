#include "runtime/array.h"

namespace {

void TestArrayObject() {
  compilets::Array<double>* tenElements = compilets::MakeObject<compilets::Array<double>>(10);
  compilets::Array<double>* oneElement = compilets::MakeObject<compilets::Array<double>>(1.23);
  compilets::Array<double>* threeElements = compilets::MakeObject<compilets::Array<double>>(1, 2, 3);
}

}  // namespace