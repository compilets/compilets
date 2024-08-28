#include "runtime/object.h"

namespace {

class Finalizer : public compilets::Object {
  CPPGC_USING_PRE_FINALIZER(Finalizer, Dispose);
 public:
  void Dispose() {}
};

}  // namespace
