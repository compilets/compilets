#ifndef CPP_RUNTIME_UNION_H_
#define CPP_RUNTIME_UNION_H_

#include <type_traits>
#include <variant>

#include "cppgc/member.h"

namespace compilets {

template<typename... From>
struct CastVariantProxy {
  const std::variant<From...>& v;

  template<typename... To>
  operator std::variant<To...>() const {
    return std::visit([](const auto& arg) {
      return std::variant<To...>{arg};
    }, v);
  }
};

// Convert a variant to its super set.
template<typename... From>
auto CastVariant(const std::variant<From...>& v) {
  return CastVariantProxy<From...>{v};
}

// Check if a type is cppgc::Member.
template<typename T>
struct IsCppgcMember : std::false_type {};
template<typename T>
struct IsCppgcMember<cppgc::Member<T>> : std::true_type {};

}  // namespace compilets

#endif  // CPP_RUNTIME_UNION_H_
