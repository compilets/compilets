#include "runtime/console.h"
#include "runtime/process.h"
#include "runtime/runtime.h"

void TestGlobals() {
  compilets::nodejs::process->exit(static_cast<double>(0));
  compilets::nodejs::Process* processRef = compilets::nodejs::process;
  processRef->exit();
  compilets::nodejs::console->log(u"text", 123, compilets::nodejs::process);
}
