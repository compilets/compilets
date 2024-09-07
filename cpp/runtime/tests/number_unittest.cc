#include "runtime/number.h"
#include "runtime/string.h"
#include "runtime/union.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

using namespace NumberConstructor;

class NumberTest : public testing::Test {
};

TEST_F(NumberTest, IsFinite) {
  EXPECT_FALSE(isFinite(POSITIVE_INFINITY));
  EXPECT_FALSE(isFinite(false));
  EXPECT_TRUE(isFinite(10 / 5));
}

TEST_F(NumberTest, ParseFloat) {
  EXPECT_EQ(parseFloat(123), 123);
  EXPECT_EQ(parseFloat(1.23), 1.23);
  EXPECT_TRUE(isNaN(parseFloat(u"Not a number")));
  EXPECT_EQ(parseFloat(u"123"), 123);
  EXPECT_EQ(parseFloat(u"1.23"), 1.23);
  EXPECT_EQ(parseFloat(String(u"123")), 123);
  EXPECT_EQ(parseFloat(String(u"1.23")), 1.23);
}

TEST_F(NumberTest, Number) {
  EXPECT_EQ(Number(123), 123);
  EXPECT_EQ(Number(1.23), 1.23);
  EXPECT_TRUE(isNaN(Number(u"Not a number")));
  EXPECT_EQ(Number(u"123"), 123);
  EXPECT_EQ(Number(u"1.23"), 1.23);
  EXPECT_EQ(Number(String(u"123")), 123);
  EXPECT_EQ(Number(String(u"1.23")), 1.23);
}

TEST_F(NumberTest, Union) {
  Union<String, double> var = 123.;
  EXPECT_EQ(parseFloat(var), 123);
  var = u"1.23";
  EXPECT_EQ(parseFloat(var), 1.23);
}

}  // namespace compilets
