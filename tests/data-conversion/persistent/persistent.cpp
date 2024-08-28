#include "runtime/array.h"

namespace {

void TestPersistent() {
  cppgc::Persistent<compilets::Array<double>> persistent = compilets::MakeArray<double>({1, 2, 3});
  compilets::Array<double>* value = persistent;
  persistent = nullptr;
}

}  // namespace
