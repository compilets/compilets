#include "runtime/array.h"

class View;
template<typename T>
class Container;
View* createView();
template<typename T>
Container<T>* createContainer();
void checkLeaks();

namespace compilets::generated {

struct Interface1;
struct Interface2;

struct Interface1 : public compilets::Object {
  Interface1(bool force) : force(force) {}

  bool force;
};

struct Interface2 : public compilets::Object {
  Interface2(bool redraw) : redraw(redraw) {}

  bool redraw;
};

}  // namespace compilets::generated

class View : public compilets::Object {
 public:
  static double count;

  cppgc::Member<compilets::Array<cppgc::Member<View>>> children = compilets::MakeArray<cppgc::Member<View>>({});

  View();

  virtual void redraw(compilets::generated::Interface1* options);

  void Trace(cppgc::Visitor* visitor) const override;

  virtual ~View();
};

template<typename T>
class Container : public compilets::Object {
 public:
  cppgc::Member<compilets::Array<compilets::CppgcMemberType<T>>> children = compilets::MakeArray<compilets::CppgcMemberType<T>>({});

  virtual void layout(compilets::generated::Interface2* options) {}

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, children);
  }

  virtual ~Container() = default;
};

template<typename T>
Container<T>* createContainer() {
  return compilets::MakeObject<Container<T>>();
}
