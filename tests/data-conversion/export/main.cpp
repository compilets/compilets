#include "runtime/runtime.h"

#include "export.h"

namespace gui = app::export_ts;

int main(int argc, const char** argv) {
  compilets::State _state;
  gui::View* view = gui::createView();
  gui::Container<gui::View>* container = gui::createContainer();
  return 0;
}
