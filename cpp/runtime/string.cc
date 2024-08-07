#include "runtime/string.h"

#include <format>

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

std::string UTF16ToUTF8(const char16_t* str, size_t length) {
  size_t utf8len = simdutf::utf8_length_from_utf16(str, length);
  std::string utf8(utf8len, '\0');
  size_t written = simdutf::convert_utf16_to_utf8(str, length, utf8.data());
  assert(utf8len == written);
  return utf8;
}

}  // namespace

std::u16string ValueToString(double value) {
  std::string str = std::format("{}", value);
  return UTF8ToUTF16(str.c_str(), str.length());
}

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

String operator+(const String& left, const String& right) {
  return String(left.value() + right.value());
}

String operator+(const char16_t* left, const String& right) {
  return String(std::u16string(right.value()) += left);
}

String operator+(const String& left, const char16_t* right) {
  return String(left.value() + right);
}

bool operator==(const String& left, const String& right) {
  return left.value() == right.value();
}

bool operator==(const char16_t* left, const String& right) {
  return right.value() == left;
}

bool operator==(const String& left, const char16_t* right) {
  return left.value() == right;
}

std::ostream& operator<<(std::ostream& os, const String& str) {
  return os << str.ToUTF8();
}

std::ostream& operator<<(std::ostream& os, const char16_t* str) {
  return os << UTF16ToUTF8(str, std::char_traits<char16_t>::length(str));
}

}  // namespace compilets
