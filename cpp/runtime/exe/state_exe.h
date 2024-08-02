#ifndef CPP_RUNTIME_EXE_STATE_EXE_H_
#define CPP_RUNTIME_EXE_STATE_EXE_H_

#include "cppgc/default-platform.h"
#include "cppgc/heap.h"
#include "cppgc/persistent.h"

namespace compilets {

class Console;
class Process;

class StateExe {
 public:
  static StateExe* Get();

  StateExe();
  ~StateExe();

  void PreciseGC();

  cppgc::AllocationHandle& GetAllocationHandle();

 private:
  std::shared_ptr<cppgc::DefaultPlatform> platform_;
  std::unique_ptr<cppgc::Heap> heap_;
  cppgc::Persistent<Console> console_;
  cppgc::Persistent<Process> process_;
};

}  // namespace compilets

#endif  // CPP_RUNTIME_EXE_STATE_EXE_H_
