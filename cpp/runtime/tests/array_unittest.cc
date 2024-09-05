#include "runtime/array.h"
#include "runtime/union.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class ArrayTest : public testing::Test {
};

TEST_F(ArrayTest, Constructor) {
  Array<double>* tenElements = MakeObject<Array<double>>(10);
  EXPECT_EQ(tenElements->length, 10);
  Array<double>* oneElement = MakeObject<Array<double>>(1.23);
  EXPECT_EQ(oneElement->length, 1);
  Array<double>* threeElements = MakeObject<Array<double>>(1, 2, 3);
  EXPECT_EQ(threeElements->length, 3);
}

TEST_F(ArrayTest, IsArray) {
  EXPECT_FALSE(ArrayConstructor::isArray(123));
  EXPECT_FALSE(ArrayConstructor::isArray(u"123"));
  Array<double>* arr = MakeArray<double>({});
  EXPECT_TRUE(ArrayConstructor::isArray(arr));
  cppgc::Member<Array<double>> arrMember = MakeArray<double>({});
  EXPECT_TRUE(ArrayConstructor::isArray(arrMember));
  arrMember = nullptr;
  EXPECT_FALSE(ArrayConstructor::isArray(arrMember));
  Union<double, Array<double>*> arrUnion = MakeArray<double>({});
  EXPECT_TRUE(ArrayConstructor::isArray(arrUnion));
  arrUnion = 89.64;
  EXPECT_FALSE(ArrayConstructor::isArray(arrUnion));
}

TEST_F(ArrayTest, Of) {
  EXPECT_EQ(ArrayConstructor::of<double>(10)->length, 1);
}

}  // namespace compilets
