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

// Convert between Array<T> and Array<cppgc::Member<T>>.
template<typename T>
Array<cppgc::Member<T>>* CastArray(Array<T*>* from) {
  std::vector<cppgc::Member<T>> to;
  for (T* e : from->value())
    to.push_back(e);
  return MakeArray<cppgc::Member<T>>(std::move(to));
}
template<typename T>
Array<T*>* CastArray(const cppgc::Member<Array<cppgc::Member<T>>>& from) {
  std::vector<T*> to;
  for (const cppgc::Member<T>& e : from->value())
    to.push_back(e.Get());
  return MakeArray<T*>(std::move(to));
}

}  // namespace compilets

#endif  // CPP_RUNTIME_ARRAY_H_
