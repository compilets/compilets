#include "runtime/string.h"

compilets::String globalStr = u"global";
compilets::String getGlobalStr() {
  return globalStr;
}
