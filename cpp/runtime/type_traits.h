#ifndef CPP_RUNTIME_TYPE_TRAITS_H_
#define CPP_RUNTIME_TYPE_TRAITS_H_

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

// Whether the type is an optional.
template<typename T>
struct IsOptional : std::false_type {};

template<typename T>
struct IsOptional<std::optional<T>> : std::true_type {};

// Read value from optional.
template<typename T>
inline T GetOptionalValue(T value) {
  if constexpr (IsOptional<T>::value)
    return std::move(value.value());
  else
    return std::move(value);
}

// Determine whether an value should evaluate to true in conditions.
template<typename T>
inline bool IsTrue(const T& value) {
  if constexpr (IsOptional<T>::value)
    return value && IsTrue(value.value());
  else
    return value;
}

// Defines the === operator of TypeScript.
template<typename T>
inline bool StrictEqual(const T& left, const T& right) {
  return left == right;
}

template<typename T, typename U>
inline bool StrictEqual(const T& left, const U& right) {
  // Compare the values of optionals.
  if constexpr (IsOptional<T>::value) {
    if (left)
      return StrictEqual(left.value(), right);
    else
      return StrictEqual(std::nullopt, right);
  }
  if constexpr (IsOptional<U>::value) {
    return StrictEqual(right, left);
  }
  // Comparing different types defaults to fail.
  return false;
}

// Receive the value type for T.
template<typename T, typename enable = void>
struct Value {
  using Type = T;
};

template<typename T, typename enable = void>
using ValueType = Value<T, enable>::Type;

// Receive the optional value type for T.
template<typename T, typename enable = void>
struct OptionalValue {
  using Type = std::optional<T>;
};

template<typename T, typename enable = void>
using OptionalValueType = OptionalValue<T, enable>::Type;

// Receive the property type for T.
template<typename T, typename enable = void>
struct CppgcMember {
  using Type = T;
};

template<typename T, typename enable = void>
using CppgcMemberType = CppgcMember<T, enable>::Type;

// Receive the optional property type for T.
template<typename T, typename enable = void>
struct OptionalCppgcMember {
  using Type = std::optional<T>;
};

template<typename T, typename enable = void>
using OptionalCppgcMemberType = OptionalCppgcMember<T, enable>::Type;

// Check if a type is cppgc::Member.
template<typename T>
struct IsCppgcMember : std::false_type {};
template<typename T>
struct IsCppgcMember<cppgc::Member<T>> : std::true_type {};

}  // namespace compilets

namespace std {

// Types that are treated as null.
//
// Defined in std namespace so they can be found via argument-dependent lookup,
// which is visible to template versions of StrictEqual wherever they are
// defined. If we put it in compilets namespace, these overloads will not be
// visible to template functions defined before them.
inline bool StrictEqual(std::nullptr_t, std::nullptr_t) { return true; }
inline bool StrictEqual(std::nullptr_t, std::nullopt_t) { return true; }
inline bool StrictEqual(std::nullopt_t, std::nullopt_t) { return true; }
inline bool StrictEqual(std::nullopt_t, std::nullptr_t) { return true; }

}  // namespace std

#endif  // CPP_RUNTIME_TYPE_TRAITS_H_
