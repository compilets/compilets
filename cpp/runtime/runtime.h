#ifndef CPP_RUNTIME_RUNTIME_H_
#define CPP_RUNTIME_RUNTIME_H_

#if defined(COMPILETS_BUILDING_NODE_MODULE)
#include "kizunapi/kizunapi.h"
#endif

#if defined(COMPILETS_BUILDING_EXE)
#include "runtime/exe/state_exe.h"
#elif defined(COMPILETS_BUILDING_NODE_MODULE)
#include "runtime/node/state_node.h"
#endif

namespace compilets {

// Globals of Node.js.
namespace nodejs {
extern Console* console;
extern Process* process;
void gc();
}

// Get the AllocationHandle from the current state.
cppgc::AllocationHandle& GetAllocationHandle();

}  // namespace compilets

#endif  // CPP_RUNTIME_RUNTIME_H_
