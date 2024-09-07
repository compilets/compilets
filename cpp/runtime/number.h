#ifndef CPP_RUNTIME_NUMBER_H_
#define CPP_RUNTIME_NUMBER_H_

#include <cmath>
#include <limits>

namespace compilets {

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
inline bool isFinite(const T& num) {
  if constexpr (IsNumericV<T>)
    return std::isfinite(num);
  else
    return false;
}

template<typename T>
inline bool isInteger(const T& num) {
  if constexpr (IsNumericV<T>)
    return std::floor(num) == num;
  else
    return false;
}

template<typename T>
inline bool isNaN(const T& num) {
  if constexpr (IsNumericV<T>)
    return std::isnan(num);
  else
    return false;
}

template<typename T>
inline bool isSafeInteger(const T& num) {
  if constexpr (IsNumericV<T>)
    return isInteger(num) && num >= MIN_SAFE_INTEGER && num <= MAX_SAFE_INTEGER;
  else
    return false;
}

template<typename T>
inline double parseFloat(T num) {
  if constexpr (IsNumericV<T>)
    return static_cast<double>(num);
  else
    return NaN;
}

template<typename T>
inline double parseInt(T num) {
  if constexpr (IsNumericV<T>)
    return static_cast<double>(static_cast<int64_t>(num));
  else
    return NaN;
}

};

using NumberConstructor::parseFloat;
using NumberConstructor::parseInt;

template<typename T>
inline double Number(const T& value) {
  return parseFloat(value);
}

}  // namespace compilets

#endif  // CPP_RUNTIME_NUMBER_H_
