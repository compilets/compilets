#ifndef CPP_RUNTIME_OBJECT_H_
#define CPP_RUNTIME_OBJECT_H_

#include "cppgc/garbage-collected.h"
#include "cppgc/prefinalizer.h"
#include "runtime/runtime.h"
#include "runtime/type_helper.h"

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

// Helper to trace the type, this is overloaded for union.
template<typename T>
inline void TraceHelper(cppgc::Visitor* visitor,
                        const cppgc::Member<T>& member) {
  visitor->Trace(member);
}

// Convert object to string.
inline std::u16string ValueToString(Object* value) {
  return u"<object>";
}

// Make cppgc::Member<T> for objects.
template<typename T>
struct CppgcMember<T, std::enable_if_t<std::is_base_of_v< Object, T>>> {
  using Type = cppgc::Member<T>;
};

template<typename T>
struct OptionalCppgcMember<T, std::enable_if_t<std::is_base_of_v< Object, T>>> {
  using Type = CppgcMember<T>::Type;
};

}  // namespace compilets

#endif  // CPP_RUNTIME_OBJECT_H_
