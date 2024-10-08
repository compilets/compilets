#ifndef CPP_RUNTIME_EXE_STATE_EXE_H_
#define CPP_RUNTIME_EXE_STATE_EXE_H_

#include "cppgc/default-platform.h"
#include "cppgc/heap.h"
#include "runtime/state.h"

namespace compilets {

class StateExe : public State {
 public:
  StateExe();
  ~StateExe();

  // State:
  void PreciseGC() override;
  cppgc::AllocationHandle& GetAllocationHandle() override;

 private:
  std::shared_ptr<cppgc::DefaultPlatform> platform_;
  std::unique_ptr<cppgc::Heap> heap_;
};

}  // namespace compilets

#endif  // CPP_RUNTIME_EXE_STATE_EXE_H_
