#include "runtime/object.h"

namespace {

void TakeNumber(double n);

class LinkNode : public compilets::Object {
 public:
  std::optional<double> item;
  cppgc::Member<LinkNode> next;

  LinkNode(double item) {
    this->item = item;
  }

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, next);
  }

  virtual ~LinkNode() = default;
};

void TestQuestionTokenInClass() {
  LinkNode* head = compilets::MakeObject<LinkNode>(0);
  if (!head->next) {
    head->next = compilets::MakeObject<LinkNode>(1);
  }
  std::optional<double> i = head->item;
  head->next->item = 3;
  TakeNumber(head->item.value());
  double n = true ? head->item.value() : 0;
  LinkNode* l = true ? head : head->next.Get();
  double memberExam = head->item.value();
  double valueExam = i.value();
}

void TakeNumber(double n) {}

}  // namespace
