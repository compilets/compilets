#ifndef CPP_RUNTIME_OBJECT_H_
#define CPP_RUNTIME_OBJECT_H_

#include "cppgc/garbage-collected.h"
#include "cppgc/member.h"
#include "cppgc/visitor.h"

namespace compilets {

class Object : public cppgc::GarbageCollected<Object> {
 public:
  virtual void Trace(cppgc::Visitor* visitor) const {}
};

}  // namespace compilets

#endif  // CPP_RUNTIME_OBJECT_H_
