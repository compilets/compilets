#include "runtime/array.h"

class View;
template<typename T>
class Container;

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

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, children);
  }

  virtual ~Container() = default;
};
