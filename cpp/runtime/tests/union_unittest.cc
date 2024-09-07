#include "runtime/string.h"
#include "runtime/union.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace compilets {

class UnionTest : public testing::Test {
};

// Verify that IsCppgcMember utility actually works.
static_assert(HasCppgcMember<double>::value == false);
static_assert(HasCppgcMember<cppgc::Member<double>>::value == true);
static_assert(HasCppgcMember<Union<double, bool>>::value == false);
static_assert(
    HasCppgcMember<Union<double, cppgc::Member<double>>>::value == true);

TEST_F(UnionTest, UnionEqualNumber) {
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

TEST_F(UnionTest, UnionStrictEqualNumber) {
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

TEST_F(UnionTest, UnionEqualUnion) {
  Union<std::monostate, String, double> n;
  EXPECT_TRUE(Equal(n, n));
  EXPECT_TRUE(StrictEqual(n, n));
  EXPECT_TRUE(StrictEqual(n, std::nullopt));
  EXPECT_TRUE(StrictEqual(n, nullptr));
}

TEST_F(UnionTest, Ordering) {
  Union<String, double> n = 123.;
  EXPECT_LT(n, 123.4);
  EXPECT_LT(n, String(u"123.4"));
  EXPECT_GT(123.4, n);
  EXPECT_GT(String(u"123.4"), n);
}

}  // namespace compilets
