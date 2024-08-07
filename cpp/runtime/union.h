#ifndef CPP_RUNTIME_UNION_H_
#define CPP_RUNTIME_UNION_H_

#include <variant>

#include "runtime/type_helper.h"

namespace compilets {

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

// Convert a variant to its super set.
template<typename Target, typename... Ts>
inline Target Cast(const std::variant<Ts...>& value) {
  return std::visit([](const auto& v) { return Cast<Target>(v); }, value);
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
