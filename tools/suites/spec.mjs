// Pins Eric's spec, word for word. If any of these move, someone changed the
// product without him asking for it.
//
//   "You get three lives per round"
//   "Invincibility for 3 seconds"
//   "Get a life back"
//   "Super uncontrollable speed ... 2x as fast ... for 5 seconds"
//   "Laser beams ... cut cars in half"
//   "bird's eye view at roughly a 45 degree angle"

import { PLAYER, POWERUPS, CAMERA } from '../../public/js/config.js';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}

check('S1 three lives per round', PLAYER.startLives === 3, String(PLAYER.startLives));
check('S2 lives cap at three hearts', PLAYER.maxLives === 3);

const ids = Object.keys(POWERUPS).sort().join(',');
check('S3 exactly the four ordered power-ups', ids === 'invincible,laser,life,runaway', ids);

check('S4 invincibility runs 3 seconds', POWERUPS.invincible.seconds === 3);
check('S5 extra life is instant', POWERUPS.life.seconds === 0);
check('S6 runaway runs 5 seconds', POWERUPS.runaway.seconds === 5);
check('S7 runaway doubles speed', POWERUPS.runaway.speedMultiplier === 2);
check('S8 laser exists with reach and cadence',
  POWERUPS.laser.range > 0 && POWERUPS.laser.cooldown > 0);

check('S9 camera pitch is roughly 45 degrees',
  Math.abs(CAMERA.pitchDegrees - 45) <= 3, String(CAMERA.pitchDegrees));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
