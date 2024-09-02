#ifndef CPP_RUNTIME_STATE_H_
#define CPP_RUNTIME_STATE_H_

#include "cppgc/persistent.h"

namespace compilets {

namespace nodejs {
class Console;
class Process;
}

class State {
 public:
  static State* Get();

  virtual void PreciseGC() = 0;
  virtual cppgc::AllocationHandle& GetAllocationHandle() = 0;

 protected:
  State();
  ~State();

  void InitializeObjects();

 private:
  cppgc::Persistent<nodejs::Console> console_;
  cppgc::Persistent<nodejs::Process> process_;
};

}  // namespace compilets

#endif  // CPP_RUNTIME_STATE_H_
