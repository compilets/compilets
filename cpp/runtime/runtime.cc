#include "runtime/runtime.h"

namespace compilets {

namespace nodejs {

void gc() {
  StateExe::Get()->PreciseGC();
}

}  // namespace nodejs

cppgc::AllocationHandle& GetAllocationHandle() {
  return StateExe::Get()->GetAllocationHandle();
}

}  // namespace compilets
