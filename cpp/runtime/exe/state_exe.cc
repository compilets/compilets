#include "runtime/exe/state_exe.h"

#include "cppgc/internal/logging.h"

namespace compilets {

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
}

StateExe::~StateExe() {
  cppgc::ShutdownProcess();
}

cppgc::AllocationHandle& StateExe::GetAllocationHandle() {
  return heap_->GetAllocationHandle();
}

}  // namespace compilets
