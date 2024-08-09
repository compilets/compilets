#ifndef CPP_RUNTIME_STRING_H_
#define CPP_RUNTIME_STRING_H_

#include <iosfwd>
#include <memory>
#include <string>

namespace compilets {

// Immutable string.
class String {
 public:
  String();
  String(std::u16string str);
  template<size_t N>
  String(const char16_t (&str)[N]) : String(std::u16string(str, N)) {}

  std::string ToUTF8() const;

  const std::u16string& value() const { return *value_.get(); }

 private:
  std::shared_ptr<std::u16string> value_;
};

// Operators for string.
String operator+(const String& left, const String& right);
std::ostream& operator<<(std::ostream& os, const String& str);
std::ostream& operator<<(std::ostream& os, const char16_t* str);

}  // namespace compilets

#endif  // CPP_RUNTIME_STRING_H_
