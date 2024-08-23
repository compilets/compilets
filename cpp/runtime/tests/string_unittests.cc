#include "runtime/string.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class StringTest : public testing::Test {
};

TEST_F(StringTest, Equal) {
  String str = u"123";
  EXPECT_TRUE(Equal(str, String(u"123")));
  EXPECT_TRUE(Equal(str, u"123"));
  EXPECT_TRUE(Equal(str, 123));
  EXPECT_TRUE(Equal(u"123", str));
  EXPECT_TRUE(Equal(123, str));
  std::optional<String> os = u"456";
  EXPECT_TRUE(Equal(os, os));
  EXPECT_TRUE(Equal(os, String(u"456")));
  EXPECT_TRUE(Equal(os, u"456"));
  EXPECT_TRUE(Equal(os, 456));
  EXPECT_TRUE(Equal(u"456", os));
  EXPECT_TRUE(Equal(456, os));
}

TEST_F(StringTest, StrictEqual) {
  String str = u"123";
  EXPECT_TRUE(StrictEqual(str, String(u"123")));
  EXPECT_TRUE(StrictEqual(str, u"123"));
  EXPECT_FALSE(StrictEqual(str, 123));
  EXPECT_TRUE(StrictEqual(u"123", str));
  EXPECT_FALSE(StrictEqual(123, str));
  std::optional<String> os = u"456";
  EXPECT_TRUE(StrictEqual(os, os));
  EXPECT_TRUE(StrictEqual(os, String(u"456")));
  EXPECT_TRUE(StrictEqual(os, u"456"));
  EXPECT_FALSE(StrictEqual(os, 456));
  EXPECT_TRUE(StrictEqual(u"456", os));
  EXPECT_FALSE(StrictEqual(456, os));
}

TEST_F(StringTest, StringBuilder) {
  EXPECT_TRUE(Equal(StringBuilder().Append(u"li")
                                   .Append(u"te")
                                   .Append(u"ral").Take(),
                    u"literal"));
}

}  // namespace compilets
