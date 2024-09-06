#ifndef CPP_RUNTIME_NODE_CONVERTERS_H_
#define CPP_RUNTIME_NODE_CONVERTERS_H_

#include "runtime/array.h"
#include "runtime/string.h"
#include "runtime/union.h"
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
    return ConvertToNode(env, arr->value(), result);
  }
  static std::optional<Array<T>*> FromNode(napi_env env, napi_value value) {
    auto arr = Type<std::vector<T>>::FromNode(env, value);
    if (arr)
      return MakeArray<T>(std::move(arr));
    else
      return std::nullopt;
  }
};

// Convert String to/from JS.
template<>
struct Type<String> {
  static constexpr const char* name = "String";
  static napi_status ToNode(napi_env env,
                            const String& str,
                            napi_value* result) {
    return ConvertToNode(env, str.value(), result);
  }
  static std::optional<String> FromNode(napi_env env, napi_value value) {
    auto str = Type<std::u16string>::FromNode(env, value);
    if (str)
      return String(std::move(str.value()));
    else
      return std::nullopt;
  }
};

// Convert Union to/from JS.
template<typename... Ts>
struct Type<Union<Ts...>> {
  static constexpr const char* name = "Union";
  static napi_status ToNode(napi_env env,
                            const Union<Ts...>& var,
                            napi_value* result) {
    return Type<std::variant<Ts...>>::ToNode(env, var, result);
  }
  static std::optional<Union<Ts...>> FromNode(napi_env env, napi_value value) {
    auto var = Type<std::variant<Ts...>>::FromNode(env, value);
    if (var)
      return Union<Ts...>(std::move(var.value()));
    else
      return std::nullopt;
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
