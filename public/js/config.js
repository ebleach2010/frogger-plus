// Every tunable number in the game, in one file.
//
// Nothing here reaches for the DOM, the renderer or three.js, which means the
// test suites can import this module directly under plain node and pin the
// difficulty curve without booting a browser. If you find yourself typing a
// magic number into a gameplay module, it probably belongs here instead.
//
// Units: world metres, seconds. One lane is 3.6m, roughly a real traffic lane,
// which is what makes the vehicle proportions look right without fiddling.

/** Directions the world is laid out in. The player runs toward -Z. */
export const AXIS = {
  ACROSS: 'x',
  ALONG: 'z',
};

export const LANE_WIDTH = 3.6;
export const SHOULDER_WIDTH = 2.2;

/** How wide the playable strip is. Running past this is a soft wall. */
export const ROAD_HALF_WIDTH = 26;

export const PLAYER = {
  radius: 0.42,
  /** Metres per second at full stick. A brisk sprint, not a car. */
  speed: 7.6,
  /** Seconds to reach full speed from standing. Keeps turns weighty. */
  accel: 0.14,
  /** Seconds to stop once the thumb lifts. */
  decel: 0.1,
  /** Invulnerable window after taking a hit, so one car cannot cost two hearts. */
  mercySeconds: 1.6,
  startLives: 3,
  maxLives: 3,
};

export const CAMERA = {
  /** Eric asked for "bird's eye at roughly a 45 degree angle". This is that. */
  pitchDegrees: 46,
  distance: 21.5,
  fov: 54,
  /** How far ahead of the player the camera leans, in metres per unit speed. */
  lookAhead: 0.72,
  /** Seconds for the camera to catch up. Higher is floatier. */
  followLag: 0.16,
  near: 0.5,
  far: 260,
};

/** The four power-ups, exactly as Eric specified them. */
export const POWERUPS = {
  invincible: {
    id: 'invincible',
    label: 'INVINCIBLE',
    seconds: 3,
    color: '#ffd257',
    glyph: '★',
  },
  life: {
    id: 'life',
    label: 'EXTRA LIFE',
    seconds: 0, // instant
    color: '#ff4f68',
    glyph: '♥',
  },
  runaway: {
    id: 'runaway',
    label: 'OUT OF CONTROL',
    seconds: 5,
    speedMultiplier: 2,
    color: '#5ad0ff',
    glyph: '»',
    /** How hard the uncontrolled heading wanders, radians per second. */
    wander: 2.4,
  },
  laser: {
    id: 'laser',
    label: 'LASER EYES',
    seconds: 6,
    color: '#ff2d55',
    glyph: '◉',
    /** Beam reach in metres. Long enough to clear two lanes ahead. */
    range: 26,
    /** Seconds between shots while the power-up is live. */
    cooldown: 0.28,
  },
};

/** Power-ups spawn on the median strips — the middle of the road, on purpose.
 *  Reaching one should cost you something. */
export const POWERUP_SPAWN = {
  /** Chance a given median carries a power-up at stage build time. */
  chance: 0.85,
  /** Metres above the road the pickup floats. */
  hover: 0.9,
  radius: 0.85,
};

export const COINS = {
  radius: 0.55,
  hover: 0.75,
  value: 1,
  /** Coins per lane band. They sit in the traffic, never on the safe strips. */
  perLane: 1.6,
};

export const SCORE = {
  /** Points for each metre of forward progress, best-distance only. */
  perMetre: 12,
  perCoin: 25,
  stageClear: 500,
  /** A car passing within this many metres at speed counts as a near miss. */
  nearMissDistance: 1.5,
  perNearMiss: 40,
};

/** Traffic behaviour. Vehicles are pooled and recycled off-screen. */
export const TRAFFIC = {
  /** Vehicle length range, metres. Buses and trucks come from the long end. */
  minSpeed: 7,
  maxSpeed: 26,
  /** Extra metres of clear road demanded behind a spawn, so cars never stack. */
  spawnClearance: 5,
  /** How far past the play area a vehicle travels before being recycled. */
  despawnMargin: 40,
};

// ---------------------------------------------------------------- stages ---

/** The three worlds, cycling every THEME_STAGES stages.
 *  These match the three reference stills Eric supplied. */
export const THEMES = ['highway', 'flood', 'junkyard'];
export const THEME_STAGES = 3;

/**
 * Difficulty for a given stage number (1-based).
 *
 * The curve is deliberately gentle for the first three stages and then bites.
 * Everything is clamped so that stage 40 is brutal but still physically
 * survivable: there is always at least MIN_GAP_SECONDS of clear road in a
 * lane, which is the difference between "hard" and "unfair".
 */
export function stageConfig(stage) {
  const n = Math.max(1, Math.floor(stage));
  const step = n - 1;

  const laneCount = Math.min(14, 4 + Math.floor(step * 0.7));
  const bands = laneBands(laneCount);

  return {
    stage: n,
    theme: THEMES[Math.floor(step / THEME_STAGES) % THEMES.length],
    /** Which pass through the three worlds this is. Drives palette shifts. */
    cycle: Math.floor(step / (THEMES.length * THEME_STAGES)),
    laneCount,
    bands,
    speedScale: Math.min(2.1, 1 + step * 0.055),
    /** Mean seconds between vehicles in one lane. Never below the floor. */
    gapSeconds: Math.max(MIN_GAP_SECONDS, 2.5 * Math.pow(0.94, step)),
    /** Fraction of vehicles that are long (bus, box truck). */
    heavyChance: Math.min(0.42, 0.12 + step * 0.018),
    /** Rain intensity, 0..1. Drives particle count and road wetness. */
    rain: Math.min(1, 0.35 + step * 0.045),
    /** Ambient darkness, 0..1. The junkyard leans on this hard. */
    gloom: Math.min(0.92, 0.2 + step * 0.05),
  };
}

/** No lane may ever be tighter than this, however high the stage. */
export const MIN_GAP_SECONDS = 0.95;

/**
 * Lays the road out along Z as an ordered list of bands.
 *
 * A band is either a safe strip you can stand on (kerb or median) or a lane of
 * moving traffic. Medians are inserted every MEDIAN_EVERY lanes; those are the
 * strips power-ups spawn on, and they are what makes a fourteen-lane stage
 * readable instead of a wall of metal.
 */
export function laneBands(laneCount) {
  const bands = [{ kind: 'kerb', depth: 5 }];
  let sinceMedian = 0;

  for (let i = 0; i < laneCount; i += 1) {
    bands.push({
      kind: 'lane',
      depth: LANE_WIDTH,
      /** Alternating flow, like a real divided highway. */
      direction: i % 2 === 0 ? 1 : -1,
      index: i,
    });
    sinceMedian += 1;

    const isLast = i === laneCount - 1;
    if (!isLast && sinceMedian >= MEDIAN_EVERY) {
      bands.push({ kind: 'median', depth: 3.1 });
      sinceMedian = 0;
    }
  }

  bands.push({ kind: 'kerb', depth: 5.5, goal: true });
  return bands;
}

export const MEDIAN_EVERY = 3;

/** Total run length of a stage in metres. */
export function stageDepth(bands) {
  return bands.reduce((sum, b) => sum + b.depth, 0);
}

/**
 * Z centre of each band, given the player starts at z = 0 and runs toward -Z.
 * Returned in the same order as `bands`.
 */
export function bandCentres(bands) {
  const centres = [];
  let edge = 0;
  for (const b of bands) {
    centres.push(edge - b.depth / 2);
    edge -= b.depth;
  }
  return centres;
}
