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
  Union(Union<Us...> value)
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
    if constexpr (IsCppgcMember<decltype(arg)>::value) {
      TraceMember(visitor, arg);
    }
  }, member);
}

// Convert variant to string.
template<typename... Ts>
inline std::u16string ValueToString(const Union<Ts...>& value) {
  return u"<variant>";
}

// Whether union evaluates to true depends on its subtypes and monostate.
inline bool IsTrue(std::monostate) {
  return false;
}

template<typename... Ts>
inline bool IsTrue(const Union<Ts...>& value) {
  return std::visit([](auto&& arg) { return IsTrue(arg); }, value);
}

// Comparing unions.
inline bool StrictEqual(std::monostate, std::nullptr_t) { return true; }
inline bool StrictEqual(std::nullptr_t, std::monostate) { return true; }
inline bool StrictEqual(std::monostate, std::nullopt_t) { return true; }
inline bool StrictEqual(std::nullopt_t, std::monostate) { return true; }

template<typename... Ts, typename... Us>
inline bool StrictEqual(const Union<Ts...>& left, const Union<Us...>& right) {
  return std::visit([&right](const auto& arg) {
    return StrictEqual(arg, std::get<decltype(arg)>(right));
  }, left);
}

template<typename... Ts, typename U>
inline bool StrictEqual(const Union<Ts...>& left, const U& right) {
  return std::visit([&right](const auto& arg) {
    return StrictEqual(arg, right);
  }, left);
}

template<typename T, typename... Us>
inline bool StrictEqual(const T& left, const Union<Us...>& right) {
  return std::visit([&left](const auto& arg) {
    return StrictEqual(left, arg);
  }, right);
}

template<typename... Ts, typename U>
inline bool StrictEqual(const Union<Ts...>& left,
                        const std::optional<U>& right) {
  if constexpr (IsUnionMember<std::monostate, Union<Ts...>>::value) {
    if (std::holds_alternative<std::monostate>(left) && !right)
      return true;
  }
  return StrictEqual(left, right.value());
}

template<typename T, typename... Us>
inline bool StrictEqual(const std::optional<T>& left,
                        const Union<Us...>& right) {
  if constexpr (IsUnionMember<std::monostate, Union<Us...>>::value) {
    if (std::holds_alternative<std::monostate>(right) && !left)
      return true;
  }
  return StrictEqual(left.value(), right);
}

// Replace T with cppgc::Member<T>.
template<typename... Ts>
struct CppgcMember<Union<Ts...>> {
  using Type = Union<CppgcMemberType<Ts>...>;
};

// Extend IsCppgcMember to check members inside a variant.
template<typename... Ts>
struct IsCppgcMember<Union<Ts...>>
    : std::disjunction<IsCppgcMember<Ts>...> {};

// Verify the IsCppgcMember utility actually works.
static_assert(IsCppgcMember<double>::value == false);
static_assert(IsCppgcMember<cppgc::Member<double>>::value == true);
static_assert(IsCppgcMember<Union<double, bool>>::value == false);
static_assert(
    IsCppgcMember<Union<double, cppgc::Member<double>>>::value == true);

}  // namespace compilets

#endif  // CPP_RUNTIME_UNION_H_
