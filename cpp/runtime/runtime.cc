#include "cpp/runtime/runtime.h"

namespace compilets {

cppgc::AllocationHandle& GetAllocationHandle() {
  return StateExe::Get()->GetAllocationHandle();
}

}  // namespace compilets
