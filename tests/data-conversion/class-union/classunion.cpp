#include "runtime/object.h"
#include "runtime/union.h"

class Member;
class HasUnionMember;
void TakeClass(Member* c);
void TestClassUnion();

class Member : public compilets::Object {
};

class HasUnionMember : public compilets::Object {
 public:
  compilets::Union<double, cppgc::Member<Member>> member;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, member);
  }

  virtual ~HasUnionMember() = default;
};

void TakeClass(Member* c) {}

void TestClassUnion() {
  compilets::Union<bool, Member*> bc = compilets::MakeObject<Member>();
  TakeClass(std::get<Member*>(bc));
  Member* member = std::get<Member*>(bc);
  TakeClass(member);
  compilets::Union<bool, Member*> abc = bc;
  TakeClass(std::get<Member*>(abc));
  HasUnionMember* has = compilets::MakeObject<HasUnionMember>();
  has->member = member;
  member = std::get<cppgc::Member<Member>>(has->member);
  Member* memberCast = std::get<cppgc::Member<Member>>(has->member);
}
