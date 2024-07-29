#include "runtime/runtime.h"

class LinkNode;
void TestQuestionToken();

class LinkNode : public cppgc::GarbageCollected<LinkNode> {
 public:
  double item;

  cppgc::Member<LinkNode> next;

  LinkNode(double item) {
    this->item = item;
  }

  void Trace(cppgc::Visitor* visitor) const {
    visitor->Trace(next);
  }
};

void TestQuestionToken() {
  LinkNode* head = cppgc::MakeGarbageCollected<LinkNode>(compilets::GetAllocationHandle(), 0);
  if (!head->next.Get()) {
    head->next = cppgc::MakeGarbageCollected<LinkNode>(compilets::GetAllocationHandle(), 1);
  }
}
