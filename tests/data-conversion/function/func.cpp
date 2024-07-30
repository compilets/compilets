#include "runtime/function.h"

double simple(double a = 1, bool b = true);
std::function<double()> complex(std::string input, std::function<double(std::string input)> callback);
void TestLocalFunction();

double simple(double a = 1, bool b = true) {
  return b ? a : 2;
}

std::function<double()> complex(std::string input, std::function<double(std::string input)> callback) {
  return [=]() -> double {
    return callback(input);
  };
}

void TestLocalFunction() {
  std::function<std::string(std::string a, std::string b)> func = [=](std::string a, std::string b) -> std::string {
    return a + b;
  };
  std::function<void()> arrow = [=]() -> void {};
}
