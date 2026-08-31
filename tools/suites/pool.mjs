// The object pool is what stands between the frame loop and the garbage
// collector. These checks pin its contract: nothing built twice that could
// be reused, double-free harmless, iteration safe against mid-loop returns.

import { createPool } from '../../public/js/engine/pool.js';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}

let builds = 0;
const pool = createPool(() => ({ id: builds += 1 }), (o) => { o.reset = true; }, 3);

check('P1 prefill builds up front', pool.builtCount === 3);
check('P2 prefill members are idle, not live', pool.liveCount === 0);

const a = pool.take();
check('P3 take reuses a prefilled member', pool.builtCount === 3 && a.id <= 3);
check('P4 reset ran on take', a.reset === true);

const taken = [a, pool.take(), pool.take(), pool.take()];
check('P5 pool grows only past its prefill', pool.builtCount === 4);
check('P6 live count tracks', pool.liveCount === 4);

pool.give(a);
pool.give(a);
check('P7 double-free is a no-op', pool.liveCount === 3);

const b = pool.take();
check('P8 freed member comes back', b === a);

// Iteration with mid-loop give: every member visited exactly once.
let visited = 0;
pool.each((o) => {
  visited += 1;
  pool.give(o);
});
check('P9 each() survives give() during iteration', visited === 4 && pool.liveCount === 0,
  JSON.stringify({ visited, live: pool.liveCount }));

pool.take();
pool.take();
pool.giveAll();
check('P10 giveAll empties the live set', pool.liveCount === 0);
check('P11 nothing was ever destroyed', pool.builtCount === 4);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
