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

// Read value from optional.
template<typename T>
inline T GetOptionalValue(T value) {
  return std::move(value);
}

template<typename T>
inline T GetOptionalValue(std::optional<T> value) {
  return std::move(*value);
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

}  // namespace co

#endif  // CPP_TYPE_HELPER_H_
