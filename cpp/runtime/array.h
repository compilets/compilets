#ifndef CPP_RUNTIME_ARRAY_H_
#define CPP_RUNTIME_ARRAY_H_

#include <vector>

#include "runtime/object.h"
#include "runtime/type_traits.h"

namespace compilets {

class ArrayConstructor;

// Type traits to determine whether a type is array.
template<typename T, typename Enable = void>
struct IsArrayTrait : std::false_type {};
template<typename T>
struct IsArrayTrait<T, std::enable_if_t<std::is_base_of_v<ArrayConstructor, T>>>
    : std::true_type {};

// In TypeScript there is no Array class but ArrayConstructor interface, we use
// it to put all the static methods..
class ArrayConstructor : public Object {
 public:
  template<typename T>
  static inline bool isArray(const T& arg) {
    return MatchTraits<IsArrayTrait>(arg);
  }
};

// The base class holding common Array constructors and methods.
template<typename T>
class ArrayBase : public ArrayConstructor {
 public:
  // Default constructor with length of 0.
  ArrayBase() = default;

  // When there is only on parameter, whether it is length or a single element
  // depends on the type of parameter.
  template<typename N,
           typename = std::enable_if_t<std::is_arithmetic_v<N>>>
  ArrayBase(N n) {
    if constexpr (std::is_integral_v<N>) {
      length = n;
      arr_ = std::vector<T>(static_cast<size_t>(n));
    } else {
      length = 1;
      arr_ = {static_cast<T>(n)};
    }
  }

  // When there are multiple number parameters, do static_cast implicitly.
  template<typename... U,
           typename = std::enable_if_t<std::is_arithmetic_v<T> &&
                                       (std::is_arithmetic_v<U> && ...)>>
  ArrayBase(U... args)
      : length(sizeof...(U)),
        arr_({static_cast<T>(args)...}) {}

  // For other types, just do normal move.
  template<typename... U,
           typename = std::enable_if_t<!(std::is_arithmetic_v<T> &&
                                         (std::is_arithmetic_v<U> && ...))>>
  ArrayBase(U&&... args)
      : length(sizeof...(U)),
        arr_({std::move(args)...}) {}

  // Used by helpers.
  ArrayBase(std::vector<T> elements) : arr_(std::move(elements)) {}

  virtual ~ArrayBase() = default;

  double length = 0;

  const std::vector<T>& value() const { return arr_; }

 private:
  std::vector<T> arr_;
};

// Array type for primitive types.
template<typename T, typename Enable = void>
class Array final : public ArrayBase<T> {
 public:
  using ArrayBase<T>::ArrayBase;
};

// Array type for GCed types.
template<typename T>
class Array<T, std::enable_if_t<HasCppgcMember<T>::value>> final
    : public ArrayBase<T> {
 public:
  using ArrayBase<T>::ArrayBase;

  virtual void Trace(cppgc::Visitor* visitor) const {
    for (const auto& member : ArrayBase<T>::value()) {
      TraceMember(visitor, member);
    }
  }
};

// Helper to create the Array from literal.
template<typename T>
inline Array<T>* MakeArray(std::vector<T> elements) {
  return cppgc::MakeGarbageCollected<Array<T>>(GetAllocationHandle(),
                                               std::move(elements));
}

// Convert array to string.
template<typename T>
inline std::u16string ValueToString(Array<T>* value) {
  return u"<array>";
}

// Convert one array to another.
template<typename Target, typename T>
inline Array<Target>* Cast(Array<T>* arr) {
  if constexpr (std::is_same_v<Target, T>)
    return arr;
  std::vector<Target> elements;
  for (const T& element : arr->value())
    elements.push_back(Cast<Target>(element));
  return MakeArray<Target>(std::move(elements));
}

}  // namespace compilets

#endif  // CPP_RUNTIME_ARRAY_H_
