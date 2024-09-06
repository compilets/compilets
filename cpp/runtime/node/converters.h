#ifndef CPP_RUNTIME_NODE_CONVERTERS_H_
#define CPP_RUNTIME_NODE_CONVERTERS_H_

#include "runtime/array.h"
#include "kizunapi/kizunapi.h"

namespace ki {

using namespace compilets;

// Convert Array to/from JS.
template<typename T>
struct Type<Array<T>*> {
  static constexpr const char* name = "Array";
  static napi_status ToNode(napi_env env,
                            const Array<T>* arr,
                            napi_value* result) {
    const auto& vec = arr->value();
    napi_status s = napi_create_array_with_length(env, vec.size(), result);
    if (s != napi_ok) return s;
    for (size_t i = 0; i < vec.size(); ++i) {
      napi_value el;
      s = ConvertToNode(env, vec[i], &el);
      if (s != napi_ok) return s;
      s = napi_set_element(env, *result, i, el);
      if (s != napi_ok) return s;
    }
    return napi_ok;
  }
  static std::optional<Array<T>*> FromNode(napi_env env, napi_value value) {
    std::vector<T> result;
    if (!IterateArray<T>(env, value,
                         [&](uint32_t i, T value) {
                           result.push_back(std::move(value));
                           return true;
                         })) {
      return std::nullopt;
    }
    return MakeArray<T>(std::move(result));
  }
};

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
