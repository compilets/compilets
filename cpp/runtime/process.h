#ifndef CPP_RUNTIME_PROCESS_H_
#define CPP_RUNTIME_PROCESS_H_

#include <variant>

#include "runtime/object.h"

namespace compilets {

class Process : public Object {
 public:
  void exit(std::variant<double, std::monostate> arg);
};

}  // namespace compilets

#endif  // CPP_RUNTIME_PROCESS_H_
