class Member {
}

function TakeMember(c: Member) {
}

class WithNumber {
  member: Member | number;

  method() {}
}

function TestMemberUnion() {
  let memberInUnion: boolean | Member = new Member();
  TakeMember(memberInUnion);
  let member: Member = memberInUnion;
  TakeMember(member);
  let copy = memberInUnion;
  TakeMember(copy);

  let wrapper = new WithNumber();
  wrapper.member = member;
  member = wrapper.member;
}

class StringMember {
  member: string;

  method() {}
}

class MemberMember {
  member: Member;

  method() {}
}

function TestClassUnion() {
  let common: WithNumber | StringMember | MemberMember = new StringMember();
  let commonMember = common.member;
  common.method();
}
