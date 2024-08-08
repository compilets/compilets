// Copyright 2020 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include <variant>
#include <vector>

#include "cppgc/src/heap/base/stack.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace cppgc {
namespace internal {

using heap::base::Stack;
using heap::base::StackVisitor;

namespace {

class StackScanTest : public ::testing::Test {
 public:
  StackScanTest() : stack_(std::make_unique<Stack>()) {
    stack_->SetStackStart();
  }

  Stack* GetStack() const { return stack_.get(); }

  // Provide containers with pointers in them, doing insertion inside the test
  // methods would make the pointers show on stack/registers which invalidates
  // the tests.
  // https://groups.google.com/g/v8-users/c/bL_IgURDZhs/m/HsMlBsVACAAJ
  const std::vector<int*>& GetVector() const { return vec_; }
  const std::variant<int*, bool>& GetVariant() const { return var_; }

 private:
  std::unique_ptr<Stack> stack_;
  std::vector<int*> vec_ = {new int{0}};
  std::variant<int*, bool> var_ = {new int{0}};
};

class StackScanner final : public StackVisitor {
 public:
  void VisitPointer(const void* address) final {
    ptrs_.insert(address);
  }

  bool HasPointer(const void* address) const {
    return ptrs_.contains(address);
  }

 private:
  std::set<const void*> ptrs_;
};

}  // namespace

TEST_F(StackScanTest, IsOnStackForVariant) {
  std::variant<void*, bool> var;
  {
    void* dummy;
    var = &dummy;
  }
  EXPECT_TRUE(GetStack()->IsOnStack(std::get<void*>(var)));
  EXPECT_TRUE(GetStack()->IsOnStack(&std::get<void*>(var)));
}

TEST_F(StackScanTest, IsOnStackForVector) {
  std::vector<void*> vec;
  {
    void* dummy;
    vec.push_back(&dummy);
  }
  EXPECT_TRUE(GetStack()->IsOnStack(vec[0]));
  // Vector's storage is in heap.
  EXPECT_FALSE(GetStack()->IsOnStack(&vec[0]));
}

TEST_F(StackScanTest, IteratePointersFindsValueInVariant) {
  auto scanner = std::make_unique<StackScanner>();
  {
    std::variant<int*, bool> var = GetVariant();
    GetStack()->IteratePointersForTesting(scanner.get());
    EXPECT_TRUE(scanner->HasPointer(std::get<int*>(var)));
  }
}

TEST_F(StackScanTest, IteratePointersFindsNoValueInVector) {
  auto scanner = std::make_unique<StackScanner>();
  {
    std::vector<int*> vec = GetVector();
    GetStack()->IteratePointersForTesting(scanner.get());
    EXPECT_FALSE(scanner->HasPointer(vec[0]));
  }
}

}  // namespace internal
}  // namespace cppgc
