#ifndef CPP_RUNTIME_NODE_STATE_NODE_H_
#define CPP_RUNTIME_NODE_STATE_NODE_H_

#include "runtime/state.h"

namespace v8 {
class Isolate;
}

namespace compilets {

class StateNode : public State {
 public:
  StateNode();

  // State:
  void PreciseGC() override;
  cppgc::AllocationHandle& GetAllocationHandle() override;

 private:
  v8::Isolate* isolate_;
};

}  // namespace co

#endif  // CPP_RUNTIME_NODE_STATE_NODE_H_
