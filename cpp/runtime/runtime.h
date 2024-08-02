#ifndef CPP_RUNTIME_RUNTIME_H_
#define CPP_RUNTIME_RUNTIME_H_

#include "cppgc/allocation.h"
#include "runtime/exe/state_exe.h"

namespace compilets {

using State = StateExe;

extern Process* process;

cppgc::AllocationHandle& GetAllocationHandle();

}  // namespace compilets

#endif  // CPP_RUNTIME_RUNTIME_H_
