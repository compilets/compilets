#ifndef CPP_RUNTIME_ARRAY_H_
#define CPP_RUNTIME_ARRAY_H_

#include <vector>

#include "runtime/object.h"
#include "runtime/type_helper.h"

namespace compilets {

template<typename T>
class ArrayBase : public Object {
 public:
  ArrayBase() = default;
  virtual ~ArrayBase() = default;

 protected:
  std::vector<T> arr_;
};

// Array type for primitive types.
template<typename T, typename Enable = void>
class Array final : public ArrayBase<T> {};

// Array type for GCed types.
template<typename T>
class Array<T, std::enable_if_t<IsCppgcMember<T>>> final : public ArrayBase<T> {
 public:
  virtual void Trace(cppgc::Visitor* visitor) const {
    for (const auto& member : arr_) {
      TraceHelper(member);
    }
  }
};

}  // namespace compilets

#endif  // CPP_RUNTIME_ARRAY_H_
