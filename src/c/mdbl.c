#include <pebble.h>

// XS virtual machine heap pools.
//
// slot  — object graph (variable bindings, properties, namespaces).
// chunk — strings, arrays, bytecode, Style/Skin objects.
// stack — call frames.
//
// Total should stay well under the Pebble app heap (~131 KB on emery).
// If the crash returns, any of these pools can be bumped or shrunk.
#define VIRTA_SLOT_SIZE  40960
#define VIRTA_CHUNK_SIZE 40960
#define VIRTA_STACK_SIZE 16384

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  ModdableCreationRecord creation = {
    .recordSize = sizeof(ModdableCreationRecord),
    .slot  = VIRTA_SLOT_SIZE,
    .chunk = VIRTA_CHUNK_SIZE,
    .stack = VIRTA_STACK_SIZE,
#ifdef ALLOY_INSTRUMENTATION
    .flags = kModdableCreationFlagLogInstrumentation,
#endif
  };
  moddable_createMachine(&creation);

  window_destroy(w);
}
