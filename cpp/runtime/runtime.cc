#include "runtime/runtime.h"

namespace compilets {

namespace nodejs {

std::optional<std::function<void()>> gc = []() {
  State::Get()->PreciseGC();
};

}  // namespace nodejs

cppgc::AllocationHandle& GetAllocationHandle() {
  return State::Get()->GetAllocationHandle();
}

}  // namespace compilets
