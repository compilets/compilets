#ifndef CPP_RUNTIME_STRING_H_
#define CPP_RUNTIME_STRING_H_

#include <compare>
#include <iosfwd>
#include <memory>
#include <string>

#include "runtime/type_traits.h"

namespace compilets {

// Immutable string.
class String {
 public:
  // Construct empty string.
  String();
  // Take ownership of the string.
  String(std::u16string str);
  // Copy string literal.
  template<size_t N>
  String(const char16_t (&str)[N]) : String(std::u16string(str, N - 1)) {}

  // The string length.
  double length = 0;

  // Accessing a char at index returns a new string.
  String operator[](size_t index) const;

  // Comparing with another string.
  bool operator==(const String& other) const {
    return value() == other.value();
  }

  // Comparing with string literals.
  bool operator==(const char16_t* other) const {
    return value() == other;
  }

  // Ordering with another string.
  std::partial_ordering operator<=>(const String& other) const {
    return value() <=> other.value();
  }

  // Ordering with string literals.
  std::partial_ordering operator<=>(const char16_t* other) const {
    return value() <=> other;
  }

  // Internal helpers.
  std::string ToUTF8() const;
  struct ToNumberResult { bool success; double result; };
  ToNumberResult ToNumber() const;
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

  String Take() {
    return std::move(value_);
  }

 private:
  std::u16string value_;
};

// Convert string to string.
inline const std::u16string& ValueToString(const String& str) {
  return str.value();
}
inline const char16_t* ValueToString(const char16_t* str) {
  return str;
}

// String evaluates true when not empty.
inline bool IsTrue(const String& str) {
  return str.length > 0;
}

// Support loose comparisons with numbers.
bool Equal(const String& left, double right);
inline bool Equal(double left, const String& right) {
  return Equal(right, left);
}

// Handle string literals for comparisons.
inline bool Equal(const String& left, const char16_t* right) {
  return left == right;
}
inline bool Equal(const char16_t* left, const String& right) {
  return right == left;
}
inline bool Equal(double left, const char16_t* right) {
  return Equal(left, String(right));
}
inline bool Equal(const char16_t* left, double right) {
  return Equal(String(left), right);
}
inline bool StrictEqual(const String& left, const char16_t* right) {
  return left == right;
}
inline bool StrictEqual(const char16_t* left, const String& right) {
  return right == left;
}

// Operators for string.
std::partial_ordering operator<=>(const String& left, double right);
inline
std::partial_ordering operator<=>(double left, const String& right) {
  return 0 <=> (right <=> left);
}
inline
std::partial_ordering operator<=>(const char16_t* left, const String& right) {
  return 0 <=> (right <=> left);
}
std::ostream& operator<<(std::ostream& os, const String& str);
std::ostream& operator<<(std::ostream& os, const char16_t* str);

// Make the number methods work with strings.
namespace NumberConstructor {
double parseFloat(const String& str);
double parseFloat(const char16_t* str);
double parseInt(const String& str);
double parseInt(const char16_t* str);
}
using NumberConstructor::parseFloat;
using NumberConstructor::parseInt;
inline double Number(const String& str) { return parseFloat(str); }
inline double Number(const char16_t* str) { return parseFloat(str); }

}  // namespace compilets

#endif  // CPP_RUNTIME_STRING_H_
