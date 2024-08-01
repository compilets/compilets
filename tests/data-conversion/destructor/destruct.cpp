#include "runtime/object.h"

class Finalizer : public compilets::Object {
  CPPGC_USING_PRE_FINALIZER(Finalizer, Dispose);
 public:
  void Dispose() {}
};
