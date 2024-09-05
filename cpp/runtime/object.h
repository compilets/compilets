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
inline std::u16string ValueToString(Object* value) {
  return u"<object>";
}

// Only enable casting pointers when they have inheritance relationship.
template<typename Target, typename T>
inline Target* Cast(T* value) {
  static_assert(std::is_base_of_v<Target, T> || std::is_base_of_v<T, Target>,
                "Pointers being casted must have inheritance relationship");
  return static_cast<Target*>(value);
}

// Allow passing pointers to MatchTraits for objects.
template<template<typename...>typename Traits, typename U,
         typename = std::enable_if_t<std::is_base_of_v<Object, U>>>
inline bool MatchTraits(const U* arg) {
  if (arg)
    return MatchTraits<Traits>(*arg);
  else
    return MatchTraits<Traits>(nullptr);
}

// Check the cppgc pointer for true evaluation.
template<typename T>
inline bool IsTrue(const cppgc::Member<T>& value) {
  return value;
}

// Compare values of cppgc::Member.
template<typename T, typename U>
inline bool StrictEqual(const cppgc::Member<T>& left,
                        const cppgc::Member<U>& right) {
  return left.Get() == right.Get();
}

template<typename T, typename U>
inline bool StrictEqual(const cppgc::Member<T>& left, U* right) {
  return left.Get() == right;
}

template<typename T, typename U>
inline bool StrictEqual(T* left, const cppgc::Member<U>& right) {
  return left == right.Get();
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
