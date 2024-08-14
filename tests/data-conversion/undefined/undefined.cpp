#include "runtime/object.h"
#include "runtime/union.h"

class LinkNode;
void TestUndefined();

class LinkNode : public compilets::Object {
 public:
  compilets::Union<double, bool, std::monostate> item;

  cppgc::Member<LinkNode> next;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceHelper(visitor, next);
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
  compilets::Union<double, bool, std::monostate> optionalUnion;
  optionalUnion = std::monostate{};
  LinkNode* node = compilets::MakeObject<LinkNode>();
  node->item = true;
  node->next = compilets::MakeObject<LinkNode>();
  node->next = nullptr;
}
