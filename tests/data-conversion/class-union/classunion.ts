class Member {
}

class HasUnionMember {
  member: Member | number;
}

function TakeClass(c: Member) {
}

function TestClassUnion() {
  let bc: boolean | Member = new Member();
  TakeClass(bc);
  let member: Member = bc;
  TakeClass(member);
  let abc = bc;
  TakeClass(abc);

  let has = new HasUnionMember();
  has.member = member;
  member = has.member;
}
