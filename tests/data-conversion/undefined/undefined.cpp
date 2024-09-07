#include "runtime/object.h"
#include "runtime/union.h"

namespace {

class LinkNode : public compilets::Object {
 public:
  compilets::Union<std::monostate, double, bool> item;
  cppgc::Member<LinkNode> next;

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, next);
  }

  virtual ~LinkNode() = default;
};

void TestUndefined() {
  std::nullptr_t undef = nullptr;
  std::nullptr_t nul = nullptr;
  std::optional<double> orUndefined = 123;
  orUndefined = std::nullopt;
  std::optional<double> orNull;
  orNull = std::nullopt;
  compilets::Union<std::monostate, double, bool> optionalUnion;
  optionalUnion = std::monostate{};
  LinkNode* node = compilets::MakeObject<LinkNode>();
  node->item = true;
  node->next = compilets::MakeObject<LinkNode>();
  node->next = nullptr;
}

}  // namespace
