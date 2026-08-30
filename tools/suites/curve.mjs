// Pins the difficulty curve: the promises stageConfig() makes to the player.
// Chief among them: however deep you get, a lane always has MIN_GAP_SECONDS
// of clear road. Hard is the product; unfair is a bug.

import {
  stageConfig, laneBands, bandCentres, stageDepth,
  MIN_GAP_SECONDS, MEDIAN_EVERY, THEMES, THEME_STAGES, LANE_WIDTH,
} from '../../public/js/config.js';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}

// C1..: the floor that keeps late stages survivable.
for (const n of [1, 5, 10, 20, 50, 200]) {
  const s = stageConfig(n);
  check(`C1 stage ${n} gap >= floor`, s.gapSeconds >= MIN_GAP_SECONDS, JSON.stringify(s.gapSeconds));
}

// C2: difficulty moves the right way and stops moving at the caps.
const s1 = stageConfig(1);
const s10 = stageConfig(10);
check('C2a lanes grow', s10.laneCount > s1.laneCount);
check('C2b speed grows', s10.speedScale > s1.speedScale);
check('C2c gap shrinks', s10.gapSeconds < s1.gapSeconds);
check('C2d lanes cap at 14', stageConfig(99).laneCount === 14);
check('C2e speed caps', stageConfig(99).speedScale <= 2.1);

// C3: themes cycle highway -> flood -> junkyard, three stages each.
check('C3a stage 1 is the highway', s1.theme === 'highway');
check('C3b stage 4 is the flood', stageConfig(4).theme === 'flood', stageConfig(4).theme);
check('C3c stage 7 is the junkyard', stageConfig(7).theme === 'junkyard', stageConfig(7).theme);
check('C3d stage 10 wraps to highway', stageConfig(10).theme === 'highway');
check('C3e three worlds, as supplied', THEMES.join(',') === 'highway,flood,junkyard');
check('C3f three stages per world', THEME_STAGES === 3);

// C4: the road is structurally sound at every size.
for (const lanes of [4, 7, 14]) {
  const bands = laneBands(lanes);
  check(`C4a ${lanes}-lane road starts and ends on kerbs`,
    bands[0].kind === 'kerb' && bands[bands.length - 1].kind === 'kerb');
  check(`C4b ${lanes}-lane road ends at a goal`, bands[bands.length - 1].goal === true);
  check(`C4c ${lanes} lanes present`, bands.filter((b) => b.kind === 'lane').length === lanes);

  // No stretch of more than MEDIAN_EVERY consecutive lanes without a rest.
  let runLength = 0;
  let worst = 0;
  for (const b of bands) {
    runLength = b.kind === 'lane' ? runLength + 1 : 0;
    worst = Math.max(worst, runLength);
  }
  check(`C4d ${lanes}-lane road rests every ${MEDIAN_EVERY}`, worst <= MEDIAN_EVERY, String(worst));

  const centres = bandCentres(bands);
  check(`C4e ${lanes}-lane centres descend`, centres.every((z, i) => i === 0 || z < centres[i - 1]));
  const depth = stageDepth(bands);
  const span = centres[0] - centres[centres.length - 1]
    + bands[0].depth / 2 + bands[bands.length - 1].depth / 2;
  check(`C4f ${lanes}-lane depth agrees with centres`, Math.abs(depth - span) < 0.001,
    JSON.stringify({ depth, span }));
}

// C5: alternating flow, real lane width.
const bands = laneBands(6);
const lanes6 = bands.filter((b) => b.kind === 'lane');
check('C5a flow alternates', lanes6.every((b, i) => b.direction === (i % 2 === 0 ? 1 : -1)));
check('C5b lanes are 3.6m', lanes6.every((b) => b.depth === LANE_WIDTH));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
