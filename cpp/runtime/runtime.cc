#include "cpp/runtime/runtime.h"

namespace compilets {

void gc() {
  StateExe::Get()->PreciseGC();
}

cppgc::AllocationHandle& GetAllocationHandle() {
  return StateExe::Get()->GetAllocationHandle();
}

}  // namespace compilets
