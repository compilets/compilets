#include "runtime/array.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class ArrayTest : public testing::Test {
};

TEST_F(ArrayTest, Constructor) {
  compilets::Array<double>* tenElements = compilets::MakeObject<compilets::Array<double>>(10);
  EXPECT_EQ(tenElements->length, 10);
  compilets::Array<double>* oneElement = compilets::MakeObject<compilets::Array<double>>(1.23);
  EXPECT_EQ(oneElement->length, 1);
  compilets::Array<double>* threeElements = compilets::MakeObject<compilets::Array<double>>(1, 2, 3);
  EXPECT_EQ(threeElements->length, 3);
}

}  // namespace compilets
