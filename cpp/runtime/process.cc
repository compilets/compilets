#include "runtime/process.h"

namespace compilets {

void Process::exit() {
  ::exit(0);
}

void Process::exit(std::variant<double, std::monostate> arg) {
  int code = 0;
  if (std::holds_alternative<double>(arg))
    code = static_cast<int>(std::get<double>(arg));
  ::exit(code);
}

}  // namespace compilets
