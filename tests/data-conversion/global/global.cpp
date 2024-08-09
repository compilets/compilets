#include "runtime/console.h"
#include "runtime/process.h"
#include "runtime/runtime.h"

void TestGlobals() {
  compilets::process->exit(static_cast<double>(0));
  compilets::Process* processRef = compilets::process;
  processRef->exit();
  compilets::console->log(u"text", 123, compilets::process);
}
