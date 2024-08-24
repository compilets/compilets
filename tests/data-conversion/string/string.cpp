#include "runtime/array.h"
#include "runtime/console.h"
#include "runtime/runtime.h"
#include "runtime/string.h"
#include "runtime/union.h"

void TakeString(compilets::String str);
void TestString();

void TakeString(compilets::String str) {}

void TestString() {
  compilets::String str = u"string";
  compilets::String rightIsLiteral = compilets::StringBuilder().Append(str).Append(u"right").Take();
  compilets::String leftIsLiteral = compilets::StringBuilder().Append(u"left").Append(str).Take();
  compilets::String noLiteral = compilets::StringBuilder().Append(str).Append(str).Take();
  TakeString(str);
  TakeString(u"literal");
  compilets::nodejs::console->log(str, u"literal");
  std::optional<compilets::String> optionalStr;
  optionalStr = str;
  str = optionalStr.value();
  compilets::Union<compilets::String, double> unionString = u"unionString";
  str = std::get<compilets::String>(unionString);
  double strLength = str.length;
  double literalLength = compilets::String(u"literal").length;
  compilets::String charactar = str[0];
  compilets::String templ = compilets::StringBuilder().Append(u"\n  This is a long string\n  ").Append(u" ").Append(1 + 3).Append(u" ").Append(u"literal").Append(u" ").Append(str).Append(u"\n  ").Append(compilets::MakeArray<double>({1, 2, 3})).Take();
  if (compilets::Equal(compilets::String(u"literal"), u"literal")) {
    compilets::String literalAdd = compilets::StringBuilder().Append(u"li").Append(u"ter").Append(u"ral").Take();
  }
  compilets::String addLiteralToNumber = compilets::StringBuilder().Append(123).Append(u"456").Take();
}
