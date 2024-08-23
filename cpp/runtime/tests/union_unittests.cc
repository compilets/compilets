#include "runtime/string.h"
#include "runtime/union.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class UnionTest : public testing::Test {
};

TEST_F(UnionTest, Equal) {
  Union<String, double> n = 123.;
  EXPECT_TRUE(Equal(n, 123));
  EXPECT_TRUE(Equal(n, u"123"));
  Union<String, double> s = u"123";
  EXPECT_TRUE(Equal(s, 123));
  EXPECT_TRUE(Equal(s, u"123"));
}

}  // namespace compilets
