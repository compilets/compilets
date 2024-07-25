class Empty {
};

class EmptyConstructor {
 public:
  EmptyConstructor() {}
};

class Simple {
 public:
  Simple(bool a, double b = 123) {
    double c = a ? b : 456;
  }

 private:
  std::string prop = "For a breath I tarry.";
};
