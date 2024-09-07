#include "runtime/type_traits.h"

#include "fastfloat/fast_float.h"
#include "simdutf/simdutf.h"

namespace compilets {

namespace {

std::u16string UTF8ToUTF16(const char* str, size_t length) {
  size_t utf16len = simdutf::utf16_length_from_utf8(str, length);
  std::u16string utf16(utf16len, '\0');
  size_t written = simdutf::convert_utf8_to_utf16(str, length, utf16.data());
  assert(utf16len == written);
  return utf16;
}

}  // namespace

std::u16string ToStringImpl(double value) {
  // Having 16 decimal digits is enough for double.
  // https://stackoverflow.com/questions/9999221
  char buffer[16] = {0};
  snprintf(buffer, sizeof(buffer), "%g", value);
  return UTF8ToUTF16(buffer, strlen(buffer));
}

}  // namespace compilets
