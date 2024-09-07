#ifndef CPP_RUNTIME_TYPE_TRAITS_H_
#define CPP_RUNTIME_TYPE_TRAITS_H_

#include <optional>
#include <string>
#include <type_traits>

#include "cppgc/member.h"
#include "cppgc/visitor.h"

namespace compilets {

// This is similar to std::visit, except that it also walks through scalars and
// cppgc::Member and std::optional.
template<typename F, typename T>
auto Visit(F&& visitor, const T& value) {
  return visitor(value);
}

template<typename F, typename T>
auto Visit(F&& visitor, const std::optional<T>& value) {
  if (value)
    return visitor(value.value());
  else
    return visitor(std::nullopt);
}

template<typename F, typename T>
auto Visit(F&& visitor, const cppgc::Member<T>& value) {
  if (value)
    return visitor(value.Get());
  else
    return visitor(nullptr);
}

// Convert value to string.
std::u16string ToStringImpl(double value);
inline std::u16string ToStringImpl(const char16_t* str) { return str; }

template<typename T>
inline std::u16string ToString(const T& value) {
  return Visit([]<typename U>(const U& arg) {
    if constexpr (requires(const U& t) { ToStringImpl(t); })
      return ToStringImpl(arg);
    return std::u16string(u"<value>");
  }, value);
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

// Check if type is any numeric type but double.
template<typename T>
constexpr bool IsNonDoubleNumericV = std::is_arithmetic_v<T> &&
                                     !std::is_same_v<T, bool> &&
                                     !std::is_same_v<T, double>;

// Check if a type is cppgc::Member.
template<typename T>
struct IsCppgcMember : std::false_type {};
template<typename T>
struct IsCppgcMember<cppgc::Member<T>> : std::true_type {};

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
  // Handle numeric types other than double.
  if constexpr (IsNonDoubleNumericV<T>) {
    return StrictEqual(static_cast<double>(left), right);
  }
  if constexpr (IsNonDoubleNumericV<U>) {
    return StrictEqual(left, static_cast<double>(right));
  }
  // Comparing different types defaults to fail.
  return false;
}

// Defines the == operator of TypeScript.
template<typename T>
inline bool Equal(const T& left, const T& right) {
  return StrictEqual(left, right);
}

template<typename T, typename U>
inline bool Equal(const T& left, const U& right) {
  // Compare the values of optionals.
  if constexpr (IsOptional<T>::value) {
    if (left)
      return Equal(left.value(), right);
    else
      return Equal(std::nullopt, right);
  }
  if constexpr (IsOptional<U>::value) {
    return Equal(right, left);
  }
  // Handle numeric types other than double.
  if constexpr (IsNonDoubleNumericV<T>) {
    return Equal(static_cast<double>(left), right);
  }
  if constexpr (IsNonDoubleNumericV<U>) {
    return Equal(left, static_cast<double>(right));
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

// Check if a type is cppgc::Member or contains one.
template<typename T>
struct HasCppgcMember : IsCppgcMember<T> {};

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
inline bool Equal(std::nullptr_t, std::nullptr_t) { return true; }
inline bool Equal(std::nullptr_t, std::nullopt_t) { return true; }
inline bool Equal(std::nullopt_t, std::nullopt_t) { return true; }
inline bool Equal(std::nullopt_t, std::nullptr_t) { return true; }

}  // namespace std

#endif  // CPP_RUNTIME_TYPE_TRAITS_H_
