#include "runtime/string.h"

template<typename T>
compilets::ValueType<T> Passthrough(compilets::ValueType<T> value);
void TestGenericFunction();

template<typename T>
compilets::ValueType<T> Passthrough(compilets::ValueType<T> value) {
  return value;
}

void TestGenericFunction() {
  compilets::String str = Passthrough<compilets::String>(u"text");
}
