// A generic object pool.
//
// Traffic, rain splashes, coins, sliced car halves and score popups are all
// created and destroyed constantly. Allocating three.js meshes at that rate is
// the single most reliable way to make a phone stutter: the allocation itself
// is cheap, but the garbage collection pause that follows lands in the middle
// of a frame and you feel it as a hitch just as a truck arrives.
//
// So nothing is ever destroyed. Objects are built once, parked, and handed out
// again. The pool grows to the high-water mark of a session and then stops.
//
// House style here is a factory function that closes over its state rather
// than a class — same shape as the rest of the codebase.

/**
 * @param {() => any} build      Makes one new member. Called only on a miss.
 * @param {(item: any) => void} [reset]  Prepares a member for reuse.
 * @param {number} [prefill]     Members to build up front, before play starts.
 */
export function createPool(build, reset, prefill = 0) {
  const idle = [];
  const live = new Set();
  let built = 0;

  for (let i = 0; i < prefill; i += 1) {
    idle.push(build());
    built += 1;
  }

  function take() {
    let item = idle.pop();
    if (!item) {
      item = build();
      built += 1;
    }
    reset?.(item);
    live.add(item);
    return item;
  }

  function give(item) {
    if (!live.delete(item)) return; // already returned; double-free is a no-op
    idle.push(item);
  }

  function giveAll() {
    for (const item of live) idle.push(item);
    live.clear();
  }

  return {
    take,
    give,
    giveAll,
    /** Iterate live members. Safe to give() during iteration. */
    each(fn) {
      for (const item of [...live]) fn(item);
    },
    get liveCount() { return live.size; },
    get builtCount() { return built; },
  };
}
