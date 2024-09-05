#include "runtime/string.h"

#include <compare>
#include <iostream>

#include "fastfloat/fast_float.h"
#include "simdutf/simdutf.h"

namespace compilets {

namespace {

std::string UTF16ToUTF8(const char16_t* str, size_t length) {
  size_t utf8len = simdutf::utf8_length_from_utf16(str, length);
  std::string utf8(utf8len, '\0');
  size_t written = simdutf::convert_utf16_to_utf8(str, length, utf8.data());
  assert(utf8len == written);
  return utf8;
}

}  // namespace

String::String()
    : value_(std::make_shared<std::u16string>()) {}

String::String(std::u16string str)
    : value_(std::make_shared<std::u16string>(std::move(str))) {
  this->length = value_->length();
}

String String::operator[](size_t index) const {
  return String(std::u16string{value()[index]});
}

std::string String::ToUTF8() const {
  return UTF16ToUTF8(value_->c_str(), value_->length());
}

String::ToNumberResult String::ToNumber() const {
  std::string s = ToUTF8();
  double d = 0;
  auto [ptr, error] = fast_float::from_chars(s.data(), s.data() + s.size(), d);
  return {error == std::errc(), d};
}

bool Equal(const String& left, double right) {
  auto [success, result] = left.ToNumber();
  if (!success)
    return false;
  return result == right;
}

std::partial_ordering operator<=>(const String& left, double right) {
  auto [success, result] = left.ToNumber();
  if (!success)
    return std::partial_ordering::unordered;
  return result <=> right;
}

std::ostream& operator<<(std::ostream& os, const String& str) {
  return os << str.ToUTF8();
}

std::ostream& operator<<(std::ostream& os, const char16_t* str) {
  return os << UTF16ToUTF8(str, std::char_traits<char16_t>::length(str));
}

}  // namespace compilets
