#ifndef CPP_RUNTIME_UNION_H_
#define CPP_RUNTIME_UNION_H_

#include <variant>

#include "runtime/type_helper.h"

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

// Helper to trace the union type.
template<typename... Ts>
inline void TraceHelper(cppgc::Visitor* visitor,
                        const std::variant<Ts...>& member) {
  std::visit([visitor](auto&& arg) {
    if constexpr (IsCppgcMember<decltype(arg)>::value) {
      TraceHelper(visitor, arg);
    }
  }, member);
}

// Extend IsCppgcMember to check members inside a variant.
template<typename... Ts>
struct IsCppgcMember<std::variant<Ts...>>
    : std::disjunction<IsCppgcMember<Ts>...> {};

// Verify the IsCppgcMember utility actually works.
static_assert(IsCppgcMember<double>::value == false);
static_assert(IsCppgcMember<cppgc::Member<double>>::value == true);
static_assert(IsCppgcMember<std::variant<double, bool>>::value == false);
static_assert(
    IsCppgcMember<std::variant<double, cppgc::Member<double>>>::value == true);

}  // namespace compilets

#endif  // CPP_RUNTIME_UNION_H_
