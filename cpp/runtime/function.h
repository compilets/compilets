#ifndef CPP_RUNTIME_FUNCTION_H_
#define CPP_RUNTIME_FUNCTION_H_

#include <functional>
#include <vector>

#include "runtime/object.h"

namespace compilets {

// Holds the lambda function and its closure.
template<typename Sig>
class Function final : public Object {
 public:
  Function(std::function<Sig> lambda,
           std::vector<cppgc::Member<Object>> closure)
    : closure_(std::move(closure)), lambda_(std::move(lambda)) {}

  virtual void Trace(cppgc::Visitor* visitor) const {
    for (const auto& object : closure_)
      visitor->Trace(object);
  }

  const std::function<Sig>& value() const { return lambda_; }

 private:
  std::vector<cppgc::Member<Object>> closure_;
  std::function<Sig> lambda_;
};

// Helper to create the Function from lambda.
template<typename Sig, typename... Closure>
inline Function<Sig>* MakeFunction(std::function<Sig> lambda,
                                   Closure*... closure) {
  return cppgc::MakeGarbageCollected<Function<Sig>>(
      GetAllocationHandle(),
      std::move(lambda),
      std::vector<cppgc::Member<Object>>({closure...}));
}

}  // namespace compilets

#endif  // CPP_RUNTIME_FUNCTION_H_
