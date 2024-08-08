#include "runtime/console.h"
#include "runtime/process.h"
#include "runtime/runtime.h"

void TestGlobals() {
  compilets::process->exit(static_cast<double>(0));
  compilets::Process* processRef = compilets::process;
  compilets::processRef->exit();
  compilets::console->log("text", 123, compilets::process);
}
