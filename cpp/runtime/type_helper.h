#ifndef CPP_TYPE_HELPER_H_
#define CPP_TYPE_HELPER_H_

#include <optional>
#include <string>
#include <type_traits>

#include "cppgc/member.h"
#include "cppgc/visitor.h"

namespace compilets {

// Convert value to string.
template<typename T>
inline std::u16string ValueToString(const T& value) {
  return u"<value>";
}

// Convert value from one type to another.
template<typename T>
inline T Cast(T value) {
  return std::move(value);
}

template<typename Target, typename T>
inline Target Cast(T&& value) {
  return Target(std::forward<T>(value));
}

// Receive the type representing property of an object for T.
template<typename T, typename enable = void>
struct CppgcMember {
  using Type = T;
};

template<typename T, typename enable = void>
using CppgcMemberT = CppgcMember<T, enable>::Type;

// Same with above but for optional properties.
template<typename T, typename enable = void>
struct OptionalCppgcMember {
  using Type = std::optional<T>;
};

template<typename T, typename enable = void>
using OptionalCppgcMemberT = OptionalCppgcMember<T, enable>::Type;

// Check if a type is cppgc::Member.
template<typename T>
struct IsCppgcMember : std::false_type {};
template<typename T>
struct IsCppgcMember<cppgc::Member<T>> : std::true_type {};

}  // namespace co

#endif  // CPP_TYPE_HELPER_H_
