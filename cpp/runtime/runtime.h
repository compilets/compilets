#ifndef CPP_RUNTIME_RUNTIME_H_
#define CPP_RUNTIME_RUNTIME_H_

#include "cppgc/allocation.h"
#include "runtime/exe/state_exe.h"
#include "runtime/object.h"

namespace compilets {

using State = StateExe;

cppgc::AllocationHandle& GetAllocationHandle();

template <typename T, typename... Args>
T* MakeObject(Args&&... args) {
  return cppgc::MakeGarbageCollected<T>(GetAllocationHandle(),
                                        std::forward<Args>(args)...);
}

}  // namespace compilets

#endif  // CPP_RUNTIME_RUNTIME_H_
