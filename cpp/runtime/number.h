#ifndef CPP_RUNTIME_NUMBER_H_
#define CPP_RUNTIME_NUMBER_H_

#include <cmath>
#include <limits>

#include "runtime/type_traits.h"

namespace compilets {

class String;

// Check if type is a numeric type (excluding bool).
template<typename T>
constexpr bool IsNumericV = std::is_arithmetic_v<T> && !std::is_same_v<T, bool>;

namespace NumberConstructor {

using limits = std::numeric_limits<double>;

inline constexpr double EPSILON = limits::epsilon();
inline constexpr double MAX_SAFE_INTEGER = 9007199254740991;  // 2^53 - 1
inline constexpr double MAX_VALUE = limits::max();
inline constexpr double MIN_SAFE_INTEGER = -MAX_SAFE_INTEGER;
inline constexpr double MIN_VALUE = limits::min();
inline constexpr double NaN = limits::quiet_NaN();
inline constexpr double NEGATIVE_INFINITY = -limits::quiet_NaN();
inline constexpr double POSITIVE_INFINITY = limits::infinity();

template<typename T>
inline bool isFinite(const T& value) {
  return Visit([]<typename U>(const U& arg) {
    if constexpr (!IsNumericV<U>)
      return false;
    return std::isfinite(arg);
  }, value);
}

template<typename T>
inline bool isInteger(const T& value) {
  return Visit([]<typename U>(const U& arg) {
    if constexpr (!IsNumericV<U>)
      return false;
    return std::floor(arg) == arg;
  }, value);
}

template<typename T>
inline bool isNaN(const T& value) {
  return Visit([]<typename U>(const U& arg) {
    if constexpr (!IsNumericV<U>)
      return false;
    return std::isnan(arg);
  }, value);
}

template<typename T>
inline bool isSafeInteger(const T& value) {
  return Visit([]<typename U>(const U& arg) {
    if constexpr (!IsNumericV<U>)
      return false;
    return isInteger(arg) && arg >= MIN_SAFE_INTEGER && arg <= MAX_SAFE_INTEGER;
  }, value);
}

double parseFloat(const String& str);
double parseFloat(const char16_t* str);

template<typename T>
inline double parseFloat(const T& value) {
  return Visit([]<typename U>(const U& arg) {
    if constexpr (IsNumericV<U>)
      return static_cast<double>(arg);
    if constexpr (std::is_same_v<U, String> || std::is_same_v<U, char16_t*>)
      return parseFloat(arg);
    return NaN;
  }, value);
}

template<typename T>
inline double parseInt(const T& value) {
  return static_cast<double>(static_cast<int64_t>(parseFloat(value)));
}

};

using NumberConstructor::parseFloat;
using NumberConstructor::parseInt;

template<typename T>
inline double Number(const T& value) { return parseFloat(value); }

}  // namespace compilets

#endif  // CPP_RUNTIME_NUMBER_H_
