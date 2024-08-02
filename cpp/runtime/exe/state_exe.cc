#include "runtime/exe/state_exe.h"

#include "cppgc/internal/logging.h"
#include "runtime/process.h"

namespace compilets {

Process* process = nullptr;

namespace {

StateExe* g_state = nullptr;

}  // namespace

// static
StateExe* StateExe::Get() {
  return g_state;
}

StateExe::StateExe()
    : platform_(std::make_shared<cppgc::DefaultPlatform>()) {
  cppgc::InitializeProcess(platform_->GetPageAllocator());
  heap_ = cppgc::Heap::Create(platform_);
  CPPGC_CHECK(!g_state);
  g_state = this;
  process_ = cppgc::MakeGarbageCollected<Process>(GetAllocationHandle());
  process = process_.Get();
}

StateExe::~StateExe() {
  process = nullptr;
  cppgc::ShutdownProcess();
}

void StateExe::PreciseGC() {
  heap_->ForceGarbageCollectionSlow("compilets", "gc()",
                                    cppgc::Heap::StackState::kNoHeapPointers);
}

cppgc::AllocationHandle& StateExe::GetAllocationHandle() {
  return heap_->GetAllocationHandle();
}

}  // namespace compilets
