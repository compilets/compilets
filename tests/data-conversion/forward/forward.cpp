#include "runtime/object.h"

namespace compilets::generated {
struct Interface1;
struct Interface2;
}

namespace {
compilets::generated::Interface1* find(compilets::generated::Interface2* options);
class Holder;
class Item;
}

namespace compilets::generated {

struct Interface1 : public compilets::Object {
  Interface1(bool success, Holder* result) : success(success), result(result) {}

  bool success;

  cppgc::Member<Holder> result;

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, result);
  }

  virtual ~Interface1() = default;
};

struct Interface2 : public compilets::Object {
  Interface2(Holder* fallback) : fallback(fallback) {}

  cppgc::Member<Holder> fallback;

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, fallback);
  }

  virtual ~Interface2() = default;
};

struct Interface3 : public compilets::Object {
  Interface3(double id, Item* item) : id(id), item(item) {}

  double id;

  cppgc::Member<Item> item;

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, item);
  }

  virtual ~Interface3() = default;
};

}  // namespace compilets::generated

namespace {

void main() {
  find(nullptr);
}

compilets::generated::Interface1* find(compilets::generated::Interface2* options) {
  if (options) {
    return compilets::MakeObject<compilets::generated::Interface1>(true, options->fallback);
  } else {
    return compilets::MakeObject<compilets::generated::Interface1>(false, compilets::MakeObject<Holder>());
  }
}

class Holder : public compilets::Object {
 public:
  cppgc::Member<compilets::generated::Interface3> data;

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, data);
  }

  virtual ~Holder() = default;
};

class Item : public compilets::Object {
};

}  // namespace
