#ifndef CPP_RUNTIME_UNION_H_
#define CPP_RUNTIME_UNION_H_

#include <type_traits>
#include <variant>

#include "runtime/type_traits.h"

namespace compilets {

class Object;

// Union extends std::variant with following abilities:
// 1. Allow construction from a subset.
// 2. Unions with different orders of same types are treated as same type.
template<typename... Ts>
class Union : public std::variant<Ts...> {
 public:
  using std::variant<Ts...>::variant;
  using std::variant<Ts...>::operator=;

  template<typename... Us>
  Union(std::variant<Us...> value)
      : std::variant<Ts...>(std::visit([](auto&& v) {
                              return std::variant<Ts...>(v);
                            }, std::move(value))) {}

  // Get the object pointer from variant.
  Object* GetObject() const {
    return std::visit([](const auto& v) {
      if constexpr (std::is_pointer_v<decltype(v)>)
        return v;
      else
        return nullptr;
    }, *this);
  }
};

// Utility to check if the type is an union.
template<typename T>
struct IsUnion : std::false_type {};

template<typename... Ts>
struct IsUnion<Union<Ts...>> : std::true_type {};

// Utility to check if the union contains a certain type.
template<typename U, typename T>
struct IsUnionMember : std::false_type {};

template<typename U, typename... Ts>
struct IsUnionMember<U, Union<Ts...>>
    : std::disjunction<std::is_same<U, Ts>...> {};

// Helper to trace the union type.
template<typename... Ts>
inline void TraceMember(cppgc::Visitor* visitor, const Union<Ts...>& member) {
  std::visit([visitor](auto&& arg) {
    if constexpr (HasCppgcMember<decltype(arg)>::value) {
      TraceMember(visitor, arg);
    }
  }, member);
}

// Pass compilets::Visit to std::visit.
template<typename F, typename... Ts>
auto Visit(F&& visitor, const Union<Ts...>& value) {
  if constexpr (IsUnionMember<std::monostate, Union<Ts...>>::value) {
    // Pass nullopt instead of monostate to visitor.
    if (std::holds_alternative<std::monostate>(value))
      return visitor(std::nullopt);
  }
  return std::visit(visitor, value);
}

// Replace T with cppgc::Member<T>.
template<typename... Ts>
struct CppgcMember<Union<Ts...>> {
  using Type = Union<CppgcMemberType<Ts>...>;
};

// Extend HasCppgcMember to check members inside a variant.
template<typename... Ts>
struct HasCppgcMember<Union<Ts...>>
    : std::disjunction<HasCppgcMember<Ts>...> {};

// Ordering for union.
template<typename... Ts, typename U>
std::partial_ordering operator<=>(const Union<Ts...>& left, const U& right) {
  return std::visit([&right](const auto& arg) {
    return arg <=> right;
  }, left);
}

}  // namespace compilets

#endif  // CPP_RUNTIME_UNION_H_
