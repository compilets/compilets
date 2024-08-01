#ifndef CPP_RUNTIME_OBJECT_H_
#define CPP_RUNTIME_OBJECT_H_

#include "cppgc/garbage-collected.h"
#include "cppgc/member.h"
#include "cppgc/prefinalizer.h"
#include "cppgc/visitor.h"
#include "runtime/runtime.h"

namespace compilets {

// Base class for TypeScript classes and functors.
class Object : public cppgc::GarbageCollected<Object> {
 public:
  virtual void Trace(cppgc::Visitor* visitor) const {}
};

// Helper to create an object type.
template<typename T, typename... Args>
T* MakeObject(Args&&... args) {
  return cppgc::MakeGarbageCollected<T>(GetAllocationHandle(),
                                        std::forward<Args>(args)...);
}

}  // namespace compilets

#endif  // CPP_RUNTIME_OBJECT_H_
