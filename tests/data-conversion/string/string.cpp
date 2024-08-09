#include <optional>

#include "runtime/console.h"
#include "runtime/runtime.h"
#include "runtime/string.h"
#include "runtime/union.h"

void TakeString(compilets::String str);
void TestString();

void TakeString(compilets::String str) {}

void TestString() {
  compilets::String str = u"string";
  compilets::String rightIsLiteral = str + u"right";
  compilets::String leftIsLiteral = u"left" + str;
  compilets::String noLiteral = str + str;
  TakeString(str);
  TakeString(u"literal");
  compilets::console->log(str, u"literal");
  std::optional<compilets::String> optionalStr;
  optionalStr = str;
  str = optionalStr.value();
  std::variant<compilets::String, double> unionString = u"unionString";
  str = std::get<compilets::String>(unionString);
  double strLength = str.length;
  double literalLength = compilets::String(u"literal").length;
}
