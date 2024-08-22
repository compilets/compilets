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

// Read value from optional.
template<typename T>
inline T GetOptionalValue(T value) {
  return std::move(value);
}

template<typename T>
inline T GetOptionalValue(std::optional<T> value) {
  return std::move(*value);
}

// Determine whether an value should evaluate to true in conditions.
template<typename T>
inline bool IsTrue(T* value) {
  return value != nullptr;
}

inline bool IsTrue(bool value) {
  return value;
}

inline bool IsTrue(double value) {
  return value != 0;
}

template<typename T>
inline bool IsTrue(const std::optional<T>& value) {
  return value && IsTrue(value.value());
}

// Defines the === operator of TypeScript.
inline bool StrictEqual(std::nullptr_t, std::nullopt_t) { return true; }
inline bool StrictEqual(std::nullopt_t, std::nullptr_t) { return true; }

template<typename T>
inline bool StrictEqual(const T& left, const T& right) {
  return left == right;
}

template<typename T, typename U>
inline bool StrictEqual(const T& left, const U& right) {
  return false;
}

template<typename T, typename U>
inline bool StrictEqual(const std::optional<T>& left,
                        const std::optional<U>& right) {
  if (!left && !right)
    return true;
  return StrictEqual(left.value(), right.value());
}

template<typename T, typename U>
inline bool StrictEqual(const std::optional<T>& left, const U& right) {
  if (left)
    return StrictEqual(left.value(), right);
  else
    return StrictEqual(std::nullopt, right);
}

template<typename T, typename U>
inline bool StrictEqual(const T& left, const std::optional<U>& right) {
  if (right)
    return StrictEqual(left, right.value());
  else
    return StrictEqual(left, std::nullopt);
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

#endif  // CPP_RUNTIME_TYPE_TRAITS_H_
