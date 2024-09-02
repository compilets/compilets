#include "runtime/exe/state_exe.h"

namespace compilets {

StateExe::StateExe()
    : platform_(std::make_shared<cppgc::DefaultPlatform>()) {
  cppgc::InitializeProcess(platform_->GetPageAllocator());
  heap_ = cppgc::Heap::Create(platform_);
  InitializeObjects();
}

StateExe::~StateExe() {
  cppgc::ShutdownProcess();
}

void StateExe::PreciseGC() {
  // TODO(zcbenz): For the sake of testing, the "gc" function is implemented as
  // PreciseGC, but it should acctually be implemented as ConservativeGC
  // otherwise we would get deleted pointers in the statements after "gc()".
  heap_->ForceGarbageCollectionSlow("compilets", "gc()",
                                    cppgc::Heap::StackState::kNoHeapPointers);
}

cppgc::AllocationHandle& StateExe::GetAllocationHandle() {
  return heap_->GetAllocationHandle();
}

}  // namespace compilets
