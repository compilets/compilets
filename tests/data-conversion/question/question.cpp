#include <optional>

#include "runtime/runtime.h"

class LinkNode;
void TestQuestionTokenInClass();
void TakeNumber(double n);

class LinkNode : public compilets::Object {
 public:
  std::optional<double> item;

  cppgc::Member<LinkNode> next;

  LinkNode(double item) {
    this->item = item;
  }

  void Trace(cppgc::Visitor* visitor) const override {
    visitor->Trace(next);
  }

  virtual ~LinkNode() = default;
};

void TestQuestionTokenInClass() {
  LinkNode* head = compilets::MakeObject<LinkNode>(0);
  if (!head->next.Get()) {
    head->next = compilets::MakeObject<LinkNode>(1);
  }
  double n = head->item.value();
  head->next.Get()->item = 3;
  TakeNumber(head->item.value());
}

void TakeNumber(double n) {}
