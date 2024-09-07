#ifndef CPP_RUNTIME_ARRAY_H_
#define CPP_RUNTIME_ARRAY_H_

#include <algorithm>
#include <vector>

#include "runtime/object.h"
#include "runtime/type_traits.h"

namespace compilets {

template<typename, typename = void>
class Array;
template<typename T>
Array<T>* MakeArray(std::vector<T> elements);

// In TypeScript there is no Array class but ArrayConstructor interface, we use
// it to put all the static methods..
class ArrayConstructor : public Object {
 public:
  template<typename T>
  static inline bool isArray(const T& value) {
    return Visit([]<typename U>(const U& arg) {
      return std::is_base_of_v<ArrayConstructor, std::remove_pointer_t<U>>;
    }, value);
  }

  template<typename T, typename... Args>
  static inline Array<T>* of(Args&&... args) {
    if constexpr (std::is_arithmetic_v<T>)
      return MakeArray<T>({static_cast<T>(args)...});
    else
      return MakeArray<T>({std::forward<Args>(args)...});
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
  ArrayBase(std::vector<T> elements)
      : length(elements.size()),
        arr_(std::move(elements)) {}

  virtual ~ArrayBase() = default;

  ValueType<T> at(double index) const {
    return value()[GetIndex(index)];
  }

  Array<T>* concat(Array<T>* other) const {
    std::vector<T> merged;
    merged.insert(merged.end(), value().begin(), value().end());
    merged.insert(merged.end(), other->value().begin(), other->value().end());
    return MakeArray<T>(std::move(merged));
  }

  Array<T>* fill(const ValueType<T>& value, double start = 0) {
    std::fill(arr_.begin() + GetIndex(start), arr_.end(), value);
    return static_cast<Array<T>*>(this);
  }

  Array<T>* fill(const ValueType<T>& value, double start, double end) {
    for (size_t i = GetIndex(start); i < GetBoundedIndex(end); ++i) {
      arr_[i] = value;
    }
    return static_cast<Array<T>*>(this);
  }

  bool includes(const ValueType<T>& value, double start = 0) const {
    for (size_t i = GetIndex(start); i < arr_.size(); ++i) {
      if (Equal(arr_[i], value))
        return true;
    }
    return false;
  }

  double indexOf(const ValueType<T>& value, double start = 0) const {
    for (size_t i = GetIndex(start); i < arr_.size(); ++i) {
      if (Equal(arr_[i], value))
        return static_cast<double>(i);
    }
    return -1;
  }

  std::u16string join(const std::u16string& separator = u",") const {
    std::u16string result;
    for (size_t i = 0; i < arr_.size(); ++i) {
      result += ToString(arr_[i]);
      if (i != arr_.size() - 1)
        result += separator;
    }
    return result;
  }

  double lastIndexOf(const ValueType<T>& value, double start = 0) const {
    for (size_t i = GetIndex(-1); i >= 0; --i) {
      if (Equal(arr_[i], value))
        return static_cast<double>(i);
    }
    return -1;
  }

  ValueType<T> pop() {
    if (length == 0)
      throw std::out_of_range("pop() called for empty array");
    T last = arr_.back();
    arr_.resize(arr_.size() - 1);
    length = static_cast<double>(arr_.size());
    return last;
  }

  template<typename... Args>
  double push(Args&&... args) {
    if constexpr (std::is_arithmetic_v<T>)
      (arr_.push_back(static_cast<T>(args)), ...);
    else
      (arr_.push_back(std::forward<Args>(args)), ...);
    length = static_cast<double>(arr_.size());
    return length;
  }

  Array<T>* reverse() {
    std::reverse(arr_.begin(), arr_.end());
    return static_cast<Array<T>*>(this);
  }

  ValueType<T> shift() {
    if (length == 0)
      throw std::out_of_range("shift() called for empty array");
    T first = arr_.front();
    arr_.erase(arr_.begin());
    length = static_cast<double>(arr_.size());
    return first;
  }

  Array<T>* slice(double start = 0) const {
    return MakeArray<T>(std::vector<T>(arr_.begin() + GetIndex(start),
                                       arr_.end()));
  }

  Array<T>* slice(double start, double end) const {
    return MakeArray<T>(std::vector<T>(arr_.begin() + GetIndex(start),
                                       arr_.begin() + GetIndex(end)));
  }

  template<typename... Args>
  Array<T>* splice(double start, double count = 0, Args&&... args) {
    std::vector<T> result;
    if (count > 0) {
      auto begin = arr_.begin() + GetBoundedIndex(start);
      result.insert(result.end(), begin, begin + count);
      result.erase(begin, begin + count);
    }
    if (sizeof...(args) > 0) {
      InsertAt(start, std::forward<Args>(args)...);
    }
    length = static_cast<double>(arr_.size());
    return MakeArray<T>(std::move(result));
  }

  template<typename... Args>
  double unshift(Args&&... args) {
    if (sizeof...(args) == 0)
      return length;
    InsertAt(0, std::forward<Args>(args)...);
    length = static_cast<double>(arr_.size());
    return length;
  }

  double length = 0;

  const std::vector<T>& value() const { return arr_; }

 private:
  size_t GetIndex(double index) const {
    return static_cast<size_t>(index < 0 ? index + length : index);
  }

  size_t GetBoundedIndex(double index) const {
    if (length > 0 && index > length - 1)
      return static_cast<size_t>(length - 1);
    return GetIndex(index);
  }

  template<typename... Args>
  void InsertAt(double pos, Args&&... args) {
    if (sizeof...(args) == 0)
      return;
    arr_.resize(arr_.size() + sizeof...(args));
    if (length > 0) {
      std::rotate(arr_.begin() + GetIndex(pos),
                  arr_.begin() + static_cast<size_t>(length),
                  arr_.end());
    }
    std::initializer_list<T> init;
    if constexpr (std::is_arithmetic_v<T>)
      init = {static_cast<T>(args)...};
    else
      init = {std::forward<Args>(args)...};
    std::copy_n(init.begin(), init.size(), arr_.begin() + GetIndex(pos));
  }

  std::vector<T> arr_;
};

// Array type for primitive types.
template<typename T, typename Enable>
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
      TracePossibleMember(visitor, member);
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
inline std::u16string ToStringImpl(Array<T>* arr) {
  std::u16string result;
  for (size_t i = 0; i < arr->value().size(); ++i) {
    result += ToString(arr->value()[i]);
    if (i != arr->value().size() - 1)
      result += u',';
  }
  return result;
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
