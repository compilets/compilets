#include "export.h"

// static
double View::count = 0;

View::View() {
  View::count++;
}

void View::Trace(cppgc::Visitor* visitor) const {
  TraceMember(visitor, children);
}

View::~View() = default;

View* createView() {
  return compilets::MakeObject<View>();
}
