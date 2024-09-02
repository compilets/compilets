#include "runtime/runtime.h"

#include "base.h"
#include "lib.h"

namespace app::cli_ts {

namespace gui = app::lib_ts;
using app::base_ts::View;

}  // namespace app::cli_ts

using namespace app::cli_ts;

int main(int argc, const char** argv) {
  compilets::StateExe _state;
  View* view = gui::createView();
  app::base_ts::Container<View>* container = gui::createContainer<View>();
  return 0;
}
