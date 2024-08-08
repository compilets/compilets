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

 private:
  std::unique_ptr<Stack> stack_;
};

class StackScanner final : public StackVisitor {
 public:
  void VisitPointer(const void* address) final {
    if (address == needle_)
      found_ = true;
  }

  void set_needle(void* ptr) { needle_ = ptr; }
  bool found() const { return found_; }

 private:
  void* needle_ = nullptr;
  bool found_ = false;
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
    std::variant<int*, bool> var = new int{0};
    scanner->set_needle(std::get<int*>(var));
    GetStack()->IteratePointersForTesting(scanner.get());
    EXPECT_TRUE(scanner->found());
  }
}

TEST_F(StackScanTest, IteratePointersFindsValueInVector) {
  auto scanner = std::make_unique<StackScanner>();
  {
    std::vector<int*> vec = {new int{0}};
    scanner->set_needle(vec[0]);
    GetStack()->IteratePointersForTesting(scanner.get());
    EXPECT_TRUE(scanner->found());
  }
}

}  // namespace internal
}  // namespace cppgc
