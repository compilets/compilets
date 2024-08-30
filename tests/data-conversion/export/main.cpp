#include "runtime/runtime.h"

#include "base.h"
#include "lib.h"

namespace app::main_ts {

namespace gui = app::lib_ts;
using app::base_ts::View;

}  // namespace app::main_ts

using namespace app::main_ts;

int main(int argc, const char** argv) {
  compilets::State _state;
  View* view = gui::createView();
  app::base_ts::Container<View>* container = gui::createContainer<View>();
  return 0;
}
