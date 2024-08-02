#include "runtime/exe/state_exe.h"

#include "cppgc/internal/logging.h"
#include "runtime/console.h"
#include "runtime/process.h"

namespace compilets {

Console* console = nullptr;
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
  console_ = cppgc::MakeGarbageCollected<Console>(GetAllocationHandle());
  console = console_.Get();
  process_ = cppgc::MakeGarbageCollected<Process>(GetAllocationHandle());
  process = process_.Get();
}

StateExe::~StateExe() {
  console = nullptr;
  process = nullptr;
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
