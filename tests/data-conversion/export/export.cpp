#include "export.h"

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

View* createView() {
  checkLeaks();
  return compilets::MakeObject<View>();
}

void checkLeaks() {
  if (View::count > 1000) {}
}
