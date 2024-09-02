#include "runtime/runtime.h"
#include "testing/gtest/include/gtest/gtest.h"

int main(int argc, char** argv) {
  compilets::StateExe state_;
  testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
