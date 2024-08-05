#include <optional>

#include "runtime/object.h"

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
  if (!head->next) {
    head->next = compilets::MakeObject<LinkNode>(1);
  }
  std::optional<double> n = head->item;
  head->next->item = 3;
  TakeNumber(head->item.value());
}

void TakeNumber(double n) {}
