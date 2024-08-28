#include "runtime/object.h"
#include "runtime/string.h"
#include "runtime/union.h"

namespace {

class Member;
class WithNumber;
class StringMember;
class MemberMember;
void TakeMember(Member* c);
void TestMemberUnion();
void TestClassUnion();

class Member : public compilets::Object {
};

void TakeMember(Member* c) {}

class WithNumber : public compilets::Object {
 public:
  compilets::Union<double, cppgc::Member<Member>> member;

  virtual void method() {}

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, member);
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

class StringMember : public compilets::Object {
 public:
  compilets::String member;

  virtual void method() {}

  virtual ~StringMember() = default;
};

class MemberMember : public compilets::Object {
 public:
  cppgc::Member<Member> member;

  virtual void method() {}

  void Trace(cppgc::Visitor* visitor) const override {
    compilets::TraceMember(visitor, member);
  }

  virtual ~MemberMember() = default;
};

void TestClassUnion() {
  compilets::Union<WithNumber*, StringMember*, MemberMember*> common = compilets::MakeObject<StringMember>();
  compilets::Union<double, Member*, compilets::String> commonMember = std::visit([](auto&& obj) -> compilets::Union<double, cppgc::Member<Member>, compilets::String> { return obj->member; }, common);
  std::visit([&](auto&& obj) -> void { return obj->method(); }, common);
}

}  // namespace
