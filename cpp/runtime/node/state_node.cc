#include "runtime/node/state_node.h"

#include "cppgc/heap.h"
#include "node/node.h"
#include "node/v8-cppgc.h"

namespace compilets {

StateNode::StateNode()
    : isolate_(v8::Isolate::GetCurrent()) {}

void StateNode::PreciseGC() {
  isolate_->MemoryPressureNotification(v8::MemoryPressureLevel::kCritical);
}

cppgc::AllocationHandle& StateNode::GetAllocationHandle() {
  return isolate_->GetCppHeap()->GetAllocationHandle();
}

}  // namespace compilets
