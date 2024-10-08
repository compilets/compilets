#ifndef CPP_RUNTIME_RUNTIME_H_
#define CPP_RUNTIME_RUNTIME_H_

#include <functional>
#include <optional>

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
extern std::optional<std::function<void()>> gc;
}

// Get the AllocationHandle from the current state.
cppgc::AllocationHandle& GetAllocationHandle();

}  // namespace compilets

#endif  // CPP_RUNTIME_RUNTIME_H_
