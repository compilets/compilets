#ifndef CPP_RUNTIME_OBJECT_H_
#define CPP_RUNTIME_OBJECT_H_

#include "cppgc/allocation.h"
#include "cppgc/garbage-collected.h"
#include "cppgc/prefinalizer.h"
#include "runtime/runtime.h"
#include "runtime/type_traits.h"

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

// Helper to trace the type, container types should overload this method.
template<typename T>
inline void TraceMember(cppgc::Visitor* visitor,
                        const cppgc::Member<T>& member) {
  visitor->Trace(member);
}

// Similar to TraceMember, but also accepts non-cppgc-member values and does
// nothing for them, this is used for unknown types.
template<typename T>
inline void TracePossibleMember(cppgc::Visitor* visitor, const T& value) {
  if constexpr (HasCppgcMember<T>::value)
    TraceMember(visitor, value);
}

// Convert object to string.
inline std::u16string ToStringImpl(Object* value) {
  return u"<object>";
}

// Make T* for objects.
template<typename T>
struct Value<T, std::enable_if_t<std::is_base_of_v<Object, T>>> {
  using Type = T*;
};

template<typename T>
struct OptionalValue<T, std::enable_if_t<std::is_base_of_v<Object, T>>> {
  using Type = Value<T>::Type;
};

// Make cppgc::Member<T> for objects.
template<typename T>
struct CppgcMember<T, std::enable_if_t<std::is_base_of_v<Object, T>>> {
  using Type = cppgc::Member<T>;
};

template<typename T>
struct OptionalCppgcMember<T, std::enable_if_t<std::is_base_of_v<Object, T>>> {
  using Type = CppgcMember<T>::Type;
};

}  // namespace compilets

#endif  // CPP_RUNTIME_OBJECT_H_
