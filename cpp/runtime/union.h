#ifndef CPP_RUNTIME_UNION_H_
#define CPP_RUNTIME_UNION_H_

#include <type_traits>
#include <variant>

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

template<typename... From>
auto CastVariant(const std::variant<From...>& v) {
  return CastVariantProxy<From...>{v};
}

}  // namespace compilets

#endif  // CPP_RUNTIME_UNION_H_
