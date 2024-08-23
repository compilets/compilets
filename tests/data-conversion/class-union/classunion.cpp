#include "runtime/object.h"
#include "runtime/string.h"
#include "runtime/union.h"

class Member;
void TakeMember(Member* c);
class WithNumber;
void TestMemberUnion();
class WithString;
void TestClassUnion();

class Member : public compilets::Object {
};

void TakeMember(Member* c) {}

class WithNumber : public compilets::Object {
 public:
  compilets::Union<double, cppgc::Member<Member>> member;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, member);
  }

  virtual ~WithNumber() = default;
};

void TestMemberUnion() {
  compilets::Union<bool, Member*> memberInUnion = compilets::MakeObject<Member>();
  TakeMember(std::get<Member*>(memberInUnion));
  Member* member = std::get<Member*>(memberInUnion);
  TakeMember(member);
  compilets::Union<bool, Member*> copy = memberInUnion;
  TakeMember(std::get<Member*>(copy));
  WithNumber* wrapper = compilets::MakeObject<WithNumber>();
  wrapper->member = member;
  member = std::get<cppgc::Member<Member>>(wrapper->member);
}

class WithString : public compilets::Object {
 public:
  compilets::Union<compilets::String, cppgc::Member<Member>> member;

  void Trace(cppgc::Visitor* visitor) const override {
    TraceMember(visitor, member);
  }

  virtual ~WithString() = default;
};

void TestClassUnion() {
  compilets::Union<WithNumber*, WithString*> common = compilets::MakeObject<WithString>();
  compilets::Union<double, Member*> commonMember = common.member;
}
