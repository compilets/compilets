double simple(double a = 1, bool b = true) {
  return b ? a : 2;
}
std::function<std::string(std::string a, std::string b)> func = [](std::string a, std::string b) -> std::string {
  return a + b;
};
std::function<void()> arrow = []() -> void {};
