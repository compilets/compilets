#ifndef CPP_RUNTIME_UNION_H_
#define CPP_RUNTIME_UNION_H_

#include <type_traits>
#include <variant>

#include "runtime/type_helper.h"

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

// Helper to trace the union type.
template<typename... Ts>
inline void TraceHelper(cppgc::Visitor* visitor, const Union<Ts...>& member) {
  std::visit([visitor](auto&& arg) {
    if constexpr (IsCppgcMember<decltype(arg)>::value) {
      TraceHelper(visitor, arg);
    }
  }, member);
}

// Convert variant to string.
template<typename... Ts>
inline std::u16string ValueToString(const Union<Ts...>& value) {
  return u"<variant>";
}

// Replace T with cppgc::Member<T>.
template<typename... Ts>
struct CppgcMember<Union<Ts...>> {
  using Type = Union<typename CppgcMember<Ts>::Type...>;
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
