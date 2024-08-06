#ifndef CPP_RUNTIME_ARRAY_H_
#define CPP_RUNTIME_ARRAY_H_

#include <vector>

#include "runtime/object.h"
#include "runtime/type_helper.h"

namespace compilets {

template<typename T>
class ArrayBase : public Object {
 public:
  ArrayBase(std::initializer_list<T> elements) : arr_(std::move(elements)) {}

  virtual ~ArrayBase() = default;

 protected:
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
    for (const auto& member : ArrayBase<T>::arr_) {
      TraceHelper(visitor, member);
    }
  }
};

// Helper to create the Array from literal.
template<typename T>
inline Array<T>* MakeArray(std::initializer_list<T> elements) {
  return cppgc::MakeGarbageCollected<Array<T>>(GetAllocationHandle(),
                                               std::move(elements));
}

}  // namespace compilets

#endif  // CPP_RUNTIME_ARRAY_H_
