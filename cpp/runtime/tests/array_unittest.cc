#include "runtime/array.h"
#include "runtime/union.h"
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

TEST_F(ArrayTest, IsArray) {
  using compilets::ArrayConstructor;
  EXPECT_FALSE(ArrayConstructor::isArray(123));
  EXPECT_FALSE(ArrayConstructor::isArray(u"123"));
  compilets::Array<double>* arr = compilets::MakeArray<double>({});
  EXPECT_TRUE(ArrayConstructor::isArray(arr));
  cppgc::Member<compilets::Array<double>> arrMember = compilets::MakeArray<double>({});
  EXPECT_TRUE(ArrayConstructor::isArray(arrMember));
  arrMember = nullptr;
  EXPECT_FALSE(ArrayConstructor::isArray(arrMember));
  compilets::Union<double, compilets::Array<double>*> arrUnion = compilets::MakeArray<double>({});
  EXPECT_TRUE(ArrayConstructor::isArray(arrUnion));
  arrUnion = 89.64;
  EXPECT_FALSE(ArrayConstructor::isArray(arrUnion));
}

}  // namespace compilets
