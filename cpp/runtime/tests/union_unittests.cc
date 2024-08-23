#include "runtime/string.h"
#include "runtime/union.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class UnionTest : public testing::Test {
};

TEST_F(UnionTest, Equal) {
  Union<String, double> n = 123.;
  EXPECT_TRUE(Equal(n, n));
  EXPECT_TRUE(Equal(n, 123));
  EXPECT_TRUE(Equal(123, n));
  EXPECT_TRUE(Equal(n, u"123"));
  EXPECT_TRUE(Equal(u"123", n));
  EXPECT_TRUE(Equal(n, Union<String, bool>(u"123")));
  EXPECT_TRUE(Equal(Union<String, bool>(u"123"), n));
  n = u"123";
  EXPECT_TRUE(Equal(n, 123));
  EXPECT_TRUE(Equal(123, n));
  EXPECT_TRUE(Equal(n, u"123"));
  EXPECT_TRUE(Equal(u"123", n));
  std::optional<double> o = 123;
  EXPECT_TRUE(Equal(n, o));
  EXPECT_TRUE(Equal(o, n));
}

TEST_F(UnionTest, StrictEqual) {
  Union<String, double> n = 123.;
  EXPECT_TRUE(StrictEqual(n, n));
  EXPECT_TRUE(StrictEqual(n, 123));
  EXPECT_TRUE(StrictEqual(123, n));
  EXPECT_FALSE(StrictEqual(n, u"123"));
  EXPECT_FALSE(StrictEqual(u"123", n));
  std::optional<double> o = 123;
  EXPECT_TRUE(StrictEqual(n, o));
  EXPECT_TRUE(StrictEqual(o, n));
  std::optional<String> s = u"123";
  EXPECT_FALSE(StrictEqual(n, s));
  EXPECT_FALSE(StrictEqual(s, n));
}

}  // namespace compilets
