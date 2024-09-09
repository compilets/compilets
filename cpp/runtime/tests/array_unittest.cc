#include "runtime/array.h"
#include "runtime/string.h"
#include "runtime/union.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class ArrayTest : public testing::Test {
};

TEST_F(ArrayTest, VectorBool) {
  Array<bool>* booleans = MakeArray<bool>({true, true, true});
  EXPECT_EQ(booleans->value(), std::vector<bool>({true, true, true}));
  booleans->value()[0] = false;
  EXPECT_EQ(booleans->value(), std::vector<bool>({false, true, true}));
}

TEST_F(ArrayTest, Constructor) {
  Array<double>* tenElements = MakeObject<Array<double>>(10);
  EXPECT_EQ(tenElements->length, 10);
  Array<double>* oneElement = MakeObject<Array<double>>(1.23);
  EXPECT_EQ(oneElement->length, 1);
  Array<double>* oneDoubleElement = MakeObject<Array<double>>(1.);
  EXPECT_EQ(oneDoubleElement->length, 1);
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

TEST_F(ArrayTest, At) {
  EXPECT_EQ(MakeArray<double>({1, 2, 3})->at(2), 3);
}

TEST_F(ArrayTest, Concat) {
  auto a = MakeArray<double>({8, 9});
  auto b = MakeArray<double>({6, 4});
  EXPECT_EQ(a->concat(b)->value(), std::vector<double>({8, 9, 6, 4}));
}

TEST_F(ArrayTest, Fill) {
  auto arr = MakeArray<double>({8, 9, 6, 4});
  EXPECT_EQ(arr->fill(1)->value(), std::vector<double>(4, 1));
}

TEST_F(ArrayTest, Includes) {
  auto arr = MakeArray<double>({8, 9, 6, 4});
  EXPECT_EQ(arr->includes(8), true);
  EXPECT_EQ(arr->includes(10), false);
}

TEST_F(ArrayTest, IndexOf) {
  auto arr = MakeArray<double>({3, 3, 9, 9});
  EXPECT_EQ(arr->indexOf(9), 2);
}

TEST_F(ArrayTest, Join) {
  auto arr = MakeArray<double>({8, 9, 6, 4});
  EXPECT_EQ(arr->join(), u"8,9,6,4");
  EXPECT_EQ(arr->join(u""), u"8964");
}

TEST_F(ArrayTest, LastIndexOf) {
  auto arr = MakeArray<double>({3, 3, 9, 9});
  EXPECT_EQ(arr->lastIndexOf(3), 1);
}

TEST_F(ArrayTest, Pop) {
  auto arr = MakeArray<double>({8, 9, 6, 4});
  EXPECT_EQ(arr->pop(), 4);
  EXPECT_EQ(arr->value(), std::vector<double>({8, 9, 6}));
}

TEST_F(ArrayTest, Push) {
  auto arr = MakeArray<double>({8, 9});
  arr->push(6, 4);
  EXPECT_EQ(arr->value(), std::vector<double>({8, 9, 6, 4}));
}

TEST_F(ArrayTest, Reverse) {
  auto arr = MakeArray<double>({8, 9, 6, 4});
  EXPECT_EQ(arr->reverse()->value(), std::vector<double>({4, 6, 9, 8}));
}

TEST_F(ArrayTest, Shift) {
  auto arr = MakeArray<double>({8, 9, 6, 4});
  EXPECT_EQ(arr->shift(), 8);
  EXPECT_EQ(arr->value(), std::vector<double>({9, 6, 4}));
}

TEST_F(ArrayTest, Slice) {
  auto arr = MakeArray<double>({8, 9, 6, 4});
  EXPECT_EQ(arr->slice(2)->value(), std::vector<double>({6, 4}));
  EXPECT_EQ(arr->slice(2, 4)->value(), std::vector<double>({6, 4}));
  EXPECT_EQ(arr->slice(2, -1)->value(), std::vector<double>({6}));
}

TEST_F(ArrayTest, Splice) {
  auto arr = MakeArray<bool>({});
  arr->splice(0, 0, true, true);
  EXPECT_EQ(arr->value(), std::vector<bool>({true, true}));
}

TEST_F(ArrayTest, Unshift) {
  auto arr = MakeArray<double>({6, 4});
  EXPECT_EQ(arr->unshift(8, 9), 4);
  EXPECT_EQ(arr->value(), std::vector<double>({8, 9, 6, 4}));
}

}  // namespace compilets
