class Member {
}

function TakeMember(c: Member) {
}

class WithNumber {
  member: Member | number;
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

class WithString {
  member: Member | string;
}

function TestClassUnion() {
  let common: WithNumber | WithString = new WithString();
  let commonMember = common.member;
}
