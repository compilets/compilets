#include "runtime/console.h"
#include "runtime/math.h"
#include "runtime/process.h"
#include "runtime/runtime.h"

namespace {

void TestGlobals() {
  compilets::nodejs::process->exit(static_cast<double>(0));
  compilets::nodejs::Process* processRef = compilets::nodejs::process;
  processRef->exit();
  compilets::nodejs::console->log(u"text", 123, compilets::nodejs::process);
  double pi = compilets::Math::PI;
  compilets::Math::floor(123);
}

}  // namespace
