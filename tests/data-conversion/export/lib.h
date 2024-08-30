#ifndef APP_LIB_H_
#define APP_LIB_H_

#include "base.h"

using app::base_ts::Container;
using MyView = app::base_ts::View;

namespace app::lib_ts {

MyView* createView();
template<typename T>
Container<T>* createContainer();

template<typename T>
Container<T>* createContainer() {
  return compilets::MakeObject<Container<T>>();
}

}  // namespace app::lib_ts

#endif  // APP_LIB_H_