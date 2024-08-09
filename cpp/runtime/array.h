#ifndef CPP_RUNTIME_ARRAY_H_
#define CPP_RUNTIME_ARRAY_H_

#include <vector>

#include "runtime/object.h"
#include "runtime/type_helper.h"

namespace compilets {

template<typename T>
class ArrayBase : public Object {
 public:
  ArrayBase(std::vector<T> elements) : arr_(std::move(elements)) {}

  virtual ~ArrayBase() = default;

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
class Array<T, std::enable_if_t<IsCppgcMember<T>::value>> final
    : public ArrayBase<T> {
 public:
  using ArrayBase<T>::ArrayBase;

  virtual void Trace(cppgc::Visitor* visitor) const {
    for (const auto& member : ArrayBase<T>::value()) {
      TraceHelper(visitor, member);
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
  std::vector<Target> elements;
  for (const T& element : arr->value())
    elements.push_back(Cast<Target>(element));
  return MakeArray<Target>(std::move(elements));
}

}  // namespace compilets

#endif  // CPP_RUNTIME_ARRAY_H_
