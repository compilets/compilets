#include "runtime/string.h"

namespace {

compilets::String globalStr = u"global";

compilets::String getGlobalStr() {
  return globalStr;
}

}  // namespace
