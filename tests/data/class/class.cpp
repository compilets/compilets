class Empty {};

class EmptyConstructor {
  constructor() {}
};

class Simple {
  std::string prop = "For a breath I tarry.";

  constructor(bool a, double b = 123) {
    double c = a ? b : 456;
  }
};

