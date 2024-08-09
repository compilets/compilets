function TakeString(str: string) {}

function TestString() {
  let str = "string";
  let rightIsLiteral = str + "right";
  let leftIsLiteral = "left" + str;
  let noLiteral = str + str;

  TakeString(str);
  TakeString("literal");
  console.log(str, "literal");

  let optionalStr: string | undefined;
  optionalStr = str;
  str = optionalStr!;

  let unionString: string | number = "unionString";
  str = unionString as string;

  let strLength = str.length;
  let literalLength = "literal".length;
}
