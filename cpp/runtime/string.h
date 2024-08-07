#ifndef CPP_RUNTIME_STRING_H_
#define CPP_RUNTIME_STRING_H_

#include <iosfwd>
#include <memory>
#include <string>

#include "runtime/type_helper.h"

namespace compilets {

std::u16string ValueToString(double value);

// Immutable string.
class String {
 public:
  String();
  String(std::u16string str);
  template<size_t N>
  String(const char16_t (&str)[N]) : String(std::u16string(str, N - 1)) {}

  String operator[](size_t index) const;

  double length = 0;

  // Internal helpers.
  std::string ToUTF8() const;
  const std::u16string& value() const { return *value_.get(); }

 private:
  std::shared_ptr<std::u16string> value_;
};

// Helper for concatenating multiple strings.
class StringBuilder {
 public:
  StringBuilder& Append(const String& str) {
    value_ += str.value();
    return *this;
  }

  StringBuilder& Append(const char16_t* str) {
    value_ += str;
    return *this;
  }

  template<typename T>
  StringBuilder& Append(T&& value) {
    value_ += ValueToString(std::forward<T>(value));
    return *this;
  }

  std::u16string Take() {
    return std::move(value_);
  }

 private:
  std::u16string value_;
};

// Operators for string.
String operator+(const String& left, const String& right);
String operator+(const char16_t* left, const String& right);
String operator+(const String& left, const char16_t* right);
bool operator==(const String& left, const String& right);
bool operator==(const char16_t* left, const String& right);
bool operator==(const String& left, const char16_t* right);
std::ostream& operator<<(std::ostream& os, const String& str);
std::ostream& operator<<(std::ostream& os, const char16_t* str);

}  // namespace compilets

#endif  // CPP_RUNTIME_STRING_H_
