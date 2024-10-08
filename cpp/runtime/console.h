#ifndef CPP_RUNTIME_CONSOLE_H_
#define CPP_RUNTIME_CONSOLE_H_

#include <iostream>

#include "runtime/object.h"
#include "runtime/string.h"

namespace compilets::nodejs {

class Console : public Object {
 public:
  template<typename... Args>
  void log(Args&&... args) {
    ((std::cout << ToString(std::forward<Args>(args)) << ' '), ...);
    std::cout << std::endl;
  }

  template<typename... Args>
  void info(Args&&... args) {
    log(std::forward<Args>(args)...);
  }

  template<typename... Args>
  void error(Args&&... args) {
    ((std::cerr << ToString(std::forward<Args>(args)) << ' '), ...);
    std::cout << std::endl;
  }

  template<typename... Args>
  void warn(Args&&... args) {
    error(std::forward<Args>(args)...);
  }
};

}  // namespace compilets::nodejs

#endif  // CPP_RUNTIME_CONSOLE_H_
