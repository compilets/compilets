#include "runtime/state.h"

#include "cppgc/internal/logging.h"
#include "runtime/console.h"
#include "runtime/process.h"

namespace compilets {

namespace nodejs {

Console* console = nullptr;
Process* process = nullptr;

}  // namespace nodejs

namespace {

State* g_state = nullptr;

}  // namespace

// static
State* State::Get() {
  return g_state;
}

State::State() {
  CPPGC_CHECK(!g_state);
  g_state = this;
}

State::~State() {
  nodejs::console = nullptr;
  nodejs::process = nullptr;
}

void State::InitializeObjects() {
  console_ = MakeObject<nodejs::Console>();
  process_ = MakeObject<nodejs::Process>();
  // Set nodejs globals.
  nodejs::console = console_.Get();
  nodejs::process = process_.Get();
}

}  // namespace compilets
