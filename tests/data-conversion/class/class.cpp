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

 protected:
  bool method() {
    return true;
  }

 private:
  std::string prop = "For a breath I tarry.";
};

Simple* s = new Simple(false);
bool r = s->method();
