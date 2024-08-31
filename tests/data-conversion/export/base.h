#ifndef APP_BASE_H_
#define APP_BASE_H_

#include "runtime/array.h"

namespace compilets::generated {

struct Interface1 : public compilets::Object {
  Interface1(bool force) : force(force) {}

  bool force;
};

struct Interface2 : public compilets::Object {
  Interface2(bool redraw) : redraw(redraw) {}

  bool redraw;
};

}  // namespace compilets::generated

namespace app::base_ts {

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

}  // namespace app::base_ts

#endif  // APP_BASE_H_
