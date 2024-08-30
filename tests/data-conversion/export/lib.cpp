#include "lib.h"

namespace app::lib_ts {

namespace {
void checkLeaks();
}

MyView* createView() {
  checkLeaks();
  return compilets::MakeObject<MyView>();
}

namespace {

void checkLeaks() {
  if (MyView::count > 1000) {}
}

}  // namespace

}  // namespace app::lib_ts
