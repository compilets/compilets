#ifndef CPP_RUNTIME_MATH_H_
#define CPP_RUNTIME_MATH_H_

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <numbers>

namespace compilets {

namespace Math {

inline constexpr double E = std::numbers::e;
inline constexpr double LN10 = std::numbers::ln10;
inline constexpr double LN2 = std::numbers::ln2;
inline constexpr double LOG10E = std::numbers::log10e;
inline constexpr double LOG2E = std::numbers::log2e;
inline constexpr double PI = std::numbers::pi;
inline constexpr double SQRT2 = std::numbers::sqrt2;

using std::abs;
using std::acos;
using std::acosh;
using std::asin;
using std::asinh;
using std::atan;
using std::atan2;
using std::atanh;
using std::cbrt;
using std::ceil;
using std::cos;
using std::cosh;
using std::exp;
using std::expm1;
using std::floor;
using std::hypot;
using std::log;
using std::log10;
using std::log1p;
using std::log2;
using std::max;
using std::min;
using std::pow;
using std::round;
using std::sin;
using std::sinh;
using std::sqrt;
using std::tan;
using std::tanh;
using std::trunc;

inline double random() {
  return ::rand() / static_cast<double>(RAND_MAX);
}

}  // namespace Math

}  // namespace compilets

#endif  // CPP_RUNTIME_MATH_H_
