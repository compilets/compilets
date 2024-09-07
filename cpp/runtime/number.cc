#include "runtime/number.h"

#include "runtime/string.h"

namespace compilets::NumberConstructor {

double parseFloat(const String& str) {
  auto [success, result] = str.ToNumber();
  return success ? result : NaN;
}

double parseFloat(const char16_t* str) {
  return parseFloat(String(str));
}

}  // namespace compilets::NumberConstructor
