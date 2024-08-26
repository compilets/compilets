#include "runtime/array.h"

class View : public compilets::Object {
 public:
  static double count;

  cppgc::Member<compilets::Array<cppgc::Member<View>>> children = compilets::MakeArray<cppgc::Member<View>>({});

  View();

  void Trace(cppgc::Visitor* visitor) const override;

  virtual ~View();
};
