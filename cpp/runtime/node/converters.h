#ifndef CPP_RUNTIME_NODE_CONVERTERS_H_
#define CPP_RUNTIME_NODE_CONVERTERS_H_

#include "runtime/array.h"
#include "kizunapi/kizunapi.h"

namespace ki {

using namespace compilets;

// Store the pointers as cppgc::Persistent in JS objects.
template<typename T>
struct TypeBridge<T, std::enable_if_t<std::is_base_of_v<Object, T>>> {
  static cppgc::Persistent<T>* Wrap(T* ptr) {
    return new cppgc::Persistent<T>(ptr);
  }
  static T* Unwrap(cppgc::Persistent<T>* data) {
    return data->Get();
  }
  static void Finalize(cppgc::Persistent<T>* data) {
    delete data;
  }
};

}  // namespace ki

#endif  // CPP_RUNTIME_NODE_CONVERTERS_H_
