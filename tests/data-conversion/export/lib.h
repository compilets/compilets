#ifndef APP_LIB_H_
#define APP_LIB_H_

#include "base.h"

namespace app::lib_ts {

using app::base_ts::Container;
using MyView = app::base_ts::View;

MyView* createView();

template<typename T>
Container<T>* createContainer() {
  return compilets::MakeObject<Container<T>>();
}

}  // namespace app::lib_ts

#endif  // APP_LIB_H_
