#ifndef CPP_TYPE_HELPER_H_
#define CPP_TYPE_HELPER_H_

#include <type_traits>

#include "cppgc/member.h"
#include "cppgc/visitor.h"

namespace compilets {

// Convert value from one type to another.
template<typename T>
inline T Cast(T value) {
  return std::move(value);
}

template<typename Target, typename T>
inline Target Cast(T&& value) {
  return Target(std::forward<T>(value));
}

// Check if a type is cppgc::Member.
template<typename T>
struct IsCppgcMember : std::false_type {};
template<typename T>
struct IsCppgcMember<cppgc::Member<T>> : std::true_type {};

}  // namespace co

#endif  // CPP_TYPE_HELPER_H_
