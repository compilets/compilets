#ifndef CPP_RUNTIME_TYPE_TRAITS_H_
#define CPP_RUNTIME_TYPE_TRAITS_H_

#include <optional>
#include <string>
#include <type_traits>

#include "cppgc/member.h"
#include "cppgc/visitor.h"

namespace compilets {

class String;

// Check if type is any numeric type but double.
template<typename T>
constexpr bool IsNonDoubleNumericV = std::is_arithmetic_v<T> &&
                                     !std::is_same_v<T, bool> &&
                                     !std::is_same_v<T, double>;

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
  else  // pass nullopt instead of monostate to visitor
    return visitor(std::nullopt);
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
template<typename T, typename = std::enable_if_t<std::is_arithmetic_v<T>>>
inline bool IsTrueImpl(T value) { return value; }
template<typename T>
inline bool IsTrueImpl(T* value) { return value; }
inline bool IsTrueImpl(std::nullopt_t) { return false; }

template<typename T>
inline bool IsTrue(const T& value) {
  return Visit([]<typename U>(const U& arg) {
    if constexpr (requires(const U& t) { IsTrueImpl(t); })
      return IsTrueImpl(arg);
    return false;
  }, value);
}

// Defines the === operator of TypeScript.
inline bool StrictEqualImpl(std::nullopt_t, std::nullopt_t) { return true; }
inline bool StrictEqualImpl(const char16_t* left, const String& right);

template<typename T, typename U>
inline bool StrictEqual(const T& left, const U& right) {
  return Visit([&right]<typename A>(const A& a) {
    return Visit([&a]<typename B>(const B& b) {
      if constexpr (std::is_same_v<A, std::nullptr_t>)
        return StrictEqual(std::nullopt, b);
      if constexpr (std::is_same_v<B, std::nullptr_t>)
        return StrictEqual(a, std::nullopt);
      if constexpr (requires(const A& x, const B& y) { StrictEqualImpl(x, y); })
        return StrictEqualImpl(a, b);
      if constexpr (requires(const A& x, const B& y) { x == y; })
        return a == b;
      return false;
    }, right);
  }, left);
}

// Defines the == operator of TypeScript.
inline bool EqualImpl(double left, const String& right);
inline bool EqualImpl(double left, const char16_t* right);
inline bool EqualImpl(const char16_t* left, double right);

template<typename T, typename U>
inline bool Equal(const T& left, const U& right) {
  return Visit([&right]<typename A>(const A& a) {
    return Visit([&a]<typename B>(const B& b) {
      if constexpr (IsNonDoubleNumericV<A>)
        return Equal(static_cast<double>(a), b);
      if constexpr (IsNonDoubleNumericV<B>)
        return Equal(a, static_cast<double>(b));
      if constexpr (requires(const A& x, const B& y) { EqualImpl(x, y); })
        return EqualImpl(a, b);
      if constexpr (requires(const A& x, const B& y) { StrictEqual(x, y); })
        return StrictEqual(a, b);
      return false;
    }, right);
  }, left);
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

#endif  // CPP_RUNTIME_TYPE_TRAITS_H_
