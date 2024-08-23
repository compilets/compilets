#include "runtime/union.h"
#include "runtime/string.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class UnionTest : public testing::Test {
};

TEST_F(UnionTest, Equal) {
  Union<String, double> u = 123.;
  EXPECT_TRUE(Equal(u, 123));
}

}  // namespace compilets
