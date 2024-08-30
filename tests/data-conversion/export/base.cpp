#include "base.h"

namespace app::base_ts {

// static
double View::count = 0;

View::View() {
  View::count++;
}

void View::redraw(compilets::generated::Interface1* options) {}

void View::Trace(cppgc::Visitor* visitor) const {
  compilets::TraceMember(visitor, children);
}

View::~View() = default;

}  // namespace app::base_ts
