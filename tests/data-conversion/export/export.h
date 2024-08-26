#include "runtime/array.h"

class View;
template<typename T>
class Container;

namespace compilets::generated {

struct Interface1 : public compilets::Object {
  Interface1(bool redraw) : redraw(redraw) {}

  bool redraw;
};

}  // namespace compilets::generated

class View : public compilets::Object {
 public:
  static double count;

  cppgc::Member<compilets::Array<cppgc::Member<View>>> children = compilets::MakeArray<cppgc::Member<View>>({});

  View();

  void Trace(cppgc::Visitor* visitor) const override;

  virtual ~View();
};

template<typename T>
class Container : public compilets::Object {
 public:
  cppgc::Member<compilets::Array<compilets::CppgcMemberType<T>>> children = compilets::MakeArray<compilets::CppgcMemberType<T>>({});

  virtual void layout(compilets::generated::Interface1* options) {}

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, children);
  }

  virtual ~Container() = default;
};
