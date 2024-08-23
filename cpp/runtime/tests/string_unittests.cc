#include "runtime/string.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class StringTest : public testing::Test {
};

TEST_F(StringTest, Equal) {
  EXPECT_TRUE(Equal(String(u"123"), String(u"123")));
  EXPECT_TRUE(Equal(String(u"123"), u"123"));
  EXPECT_TRUE(Equal(String(u"123"), 123));
  EXPECT_TRUE(Equal(u"123", String(u"123")));
  EXPECT_TRUE(Equal(123, String(u"123")));
}

TEST_F(StringTest, StrictEqual) {
  EXPECT_TRUE(StrictEqual(String(u"123"), String(u"123")));
  EXPECT_TRUE(StrictEqual(String(u"123"), u"123"));
  EXPECT_FALSE(StrictEqual(String(u"123"), 123));
  EXPECT_TRUE(StrictEqual(u"123", String(u"123")));
  EXPECT_FALSE(StrictEqual(123, String(u"123")));
}

TEST_F(StringTest, StringBuilder) {
  EXPECT_TRUE(Equal(StringBuilder().Append(u"li")
                                   .Append(u"te")
                                   .Append(u"ral").Take(),
                    u"literal"));
}

}  // namespace compilets
