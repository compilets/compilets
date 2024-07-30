#ifndef CPP_RUNTIME_FUNCTION_H_
#define CPP_RUNTIME_FUNCTION_H_

#include <functional>
#include <vector>

#include "runtime/object.h"

namespace compilets {

// Holds the lambda function and its closure.
template <typename Sig>
class Function final : public Object {
 public:
  Function(std::function<Sig> lambda) : lambda_(std::move(lambda)) {}

  virtual void Trace(cppgc::Visitor* visitor) const {
    for (const auto& object : closure_)
      visitor->Trace(object);
  }

 private:
  std::vector<cppgc::Member<Object>> closure_;
  std::function<Sig> lambda_;
};

}  // namespace compilets

#endif  // CPP_RUNTIME_FUNCTION_H_
