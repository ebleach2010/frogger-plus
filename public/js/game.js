// The game itself: stage lifecycle, collisions, lives, scoring, power-ups.
//
// Everything render-shaped lives in the modules this file wires together;
// this file owns the RULES. Three lives a round. Forward progress scores,
// coins score, near misses score, clearing a stage scores big. A moving car
// is death; a wreck is a wall; a power-up is one of Eric's four, exactly as
// specified in config.js.

import * as THREE from 'three';
import {
  PLAYER, POWERUPS, SCORE, COINS,
  stageConfig, bandCentres, stageDepth,
} from './config.js';
import { createRoad, laneSlots, goalZ as findGoalZ } from './world/road.js';
import { createTraffic } from './world/traffic.js';
import { createCrush } from './world/crush.js';
import { createScenery } from './world/scenery.js';
import { createRain } from './world/rain.js';
import { createSky, createKeyLight, trackKeyLight, SKIES } from './engine/sky.js';
import { createPlayer } from './play/player.js';
import { createPowerups } from './play/powerups.js';
import { createLaser } from './play/laser.js';
import { createGore } from './play/gore.js';

const BEST_KEY = 'fp-best';

export function createGame({ scene, renderer, hud, sprite, cameraRig }) {
  // ------------------------------------------------------- world pieces ---

  const traffic = createTraffic(scene, null);
  const gore = createGore(scene);
  const crush = createCrush(scene, traffic, {
    onCrash() { cameraRig.impulse(0.3); },
  });
  const laser = createLaser(scene, traffic, crush);
  const powerups = createPowerups(scene);
  const scenery = createScenery(scene);
  const rain = createRain(scene);
  const player = createPlayer(scene, sprite);

  let sky = null;
  let keyLight = null;
  let fill = null;
  let road = null;

  // ------------------------------------------------------------- state ----

  const run = {
    /** 'title' | 'playing' | 'gameover' */
    phase: 'title',
    stage: 1,
    lives: PLAYER.startLives,
    score: 0,
    coins: 0,
    bestZ: 0,
    stageData: null,
    centres: null,
    goalZ: 0,
    startZ: 0,
    depth: 0,
    /** Active timed power-ups: type -> seconds remaining. */
    effects: new Map(),
  };

  function best() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch { /* storage blocked */ return 0; }
  }

  function saveBest(score) {
    try {
      const current = best();
      if (score > current) localStorage.setItem(BEST_KEY, String(Math.floor(score)));
    } catch { /* storage blocked */ }
  }

  // ------------------------------------------------------ stage builds ----

  function buildStage(stageNumber) {
    const stage = stageConfig(stageNumber);
    const centres = bandCentres(stage.bands);

    // Tear down the old world.
    road?.dispose();
    if (road) scene.remove(road.group);
    if (sky) {
      scene.remove(sky.mesh);
      sky.dispose();
    }
    if (keyLight) {
      scene.remove(keyLight);
      scene.remove(keyLight.target);
    }
    crush.reset();
    gore.reset();
    laser.reset();

    // Sky first: its environment map lights everything else.
    sky = createSky(renderer.renderer, stage.theme);
    scene.add(sky.mesh);
    scene.environment = sky.environment;

    const theme = SKIES[stage.theme];
    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

    keyLight = createKeyLight(theme);
    scene.add(keyLight);
    scene.add(keyLight.target);

    // Fill: the city's own glow bouncing off the cloud base. Without it the
    // shadowed side of everything drops to pure black and the grade eats it.
    if (fill) scene.remove(fill);
    fill = new THREE.HemisphereLight(theme.fillSky, 0x14161c, theme.ambient);
    scene.add(fill);

    road = createRoad(stage, centres, sky.environment);
    scene.add(road.group);

    scenery.build(stage, centres, sky.environment);
    traffic.reset(laneSlots(stage, centres), stage);
    traffic.setEnvironment(sky.environment);
    powerups.populate(stage, centres);
    rain.setIntensity(stage.theme === 'junkyard' ? stage.rain * 0.5 : stage.rain);

    run.stageData = stage;
    run.centres = centres;
    run.goalZ = findGoalZ(stage, centres);
    run.startZ = centres[0];
    run.depth = stageDepth(stage.bands);
    run.bestZ = run.startZ;

    player.place(0, run.startZ);
    cameraRig.snap(0, run.startZ);
    hud.setStage(stageNumber);
  }

  // ------------------------------------------------------ player world ----

  /** The queries player.update needs each frame, closed over run state. */
  const playerWorld = {
    get minZ() { return run.goalZ - 2; },
    get maxZ() { return run.startZ + 2.2; },
    blockedAt(x, z) {
      return crush.wreckAt(x, z, PLAYER.radius) !== null;
    },
    floorAt(z) {
      // On a kerb or median band, his feet ride on the concrete.
      if (!run.stageData) return 0;
      let edge = 0;
      for (const band of run.stageData.bands) {
        const lower = edge - band.depth;
        if (z <= edge && z > lower) return band.kind === 'lane' ? 0 : 0.2;
        edge = lower;
      }
      return 0;
    },
    onBodyBounce(x, z, bounce) {
      gore.burst(x, z, { x: 0, z: 0 }, bounce === 1 ? 0.7 : 0.35);
    },
    onBodyRest(x, z) {
      gore.pool(x, z);
    },
  };

  const trafficEvents = {
    onNearMiss() {
      if (run.phase !== 'playing') return;
      run.score += SCORE.perNearMiss;
    },
    onPileup() {
      cameraRig.impulse(0.35);
    },
  };

  const pickupEvents = {
    onPower(type) {
      const spec = POWERUPS[type];
      hud.toast(spec.label, spec.color);

      if (type === 'life') {
        if (run.lives < PLAYER.maxLives) {
          run.lives += 1;
          hud.setLives(run.lives, { gained: true });
        } else {
          run.score += 250; // full hearts: the game pays cash instead
        }
        return;
      }

      run.effects.set(type, spec.seconds);
      hud.powerOn(type);
      if (type === 'runaway') player.setRunaway(true);
    },
    onCoin() {
      run.coins += COINS.value;
      run.score += SCORE.perCoin;
      hud.setCoins(run.coins);
    },
  };

  // ------------------------------------------------------------ deaths ----

  function killPlayer(vehicle) {
    run.lives -= 1;
    hud.setLives(run.lives, { popped: true });
    cameraRig.impulse(0.65);

    const along = vehicle
      ? { x: vehicle.direction, z: 0 }
      : { x: 0, z: -1 };
    gore.burst(player.state.x, player.state.z, along, 1.3);

    // Cancel every running effect; the body takes them with it.
    run.effects.clear();
    hud.powerClear();
    player.setRunaway(false);

    player.ragdoll(vehicle);
  }

  function respawnOrEnd() {
    if (run.lives > 0) {
      player.respawn(0, run.startZ);
      return;
    }

    run.phase = 'gameover';
    saveBest(run.score);
    hud.setResults({
      score: run.score,
      best: best(),
      stage: run.stage,
      coins: run.coins,
    });
    hud.show('over');
  }

  // ------------------------------------------------------------- flow -----

  function startRun() {
    run.phase = 'playing';
    run.stage = 1;
    run.lives = PLAYER.startLives;
    run.score = 0;
    run.coins = 0;
    run.effects.clear();
    hud.powerClear();
    hud.setLives(run.lives);
    hud.setScore(0);
    hud.setCoins(0);
    player.setRunaway(false);
    buildStage(1);
    hud.show('none');
    hud.toast('GO!');
  }

  function clearStage() {
    run.score += SCORE.stageClear;
    run.stage += 1;
    hud.toast(`STAGE ${run.stage}`, '#f6c33d');
    buildStage(run.stage);
  }

  // ------------------------------------------------------------ update ----

  function update(dt, input) {
    const cameraQuaternion = cameraRig.camera.quaternion;

    // Timed effects tick even between deaths, so the HUD bars drain honestly.
    for (const [type, remaining] of run.effects) {
      const next = remaining - dt;
      if (next <= 0) {
        run.effects.delete(type);
        if (type === 'runaway') player.setRunaway(false);
      } else {
        run.effects.set(type, next);
      }
    }
    hud.powerTick(dt);

    const playing = run.phase === 'playing';
    const focus = playing ? player.state : { x: 0, z: run.startZ, vx: 0, vz: 0 };

    if (playing) {
      player.update(dt, input, playerWorld);

      // Score forward progress once per metre of NEW ground.
      if (player.state.mode === 'run' && player.state.z < run.bestZ) {
        run.score += (run.bestZ - player.state.z) * SCORE.perMetre;
        run.bestZ = player.state.z;
      }

      // Stage clear?
      if (player.state.mode === 'run' && player.state.z <= run.goalZ + 1.2) {
        clearStage();
      }

      // Collisions.
      const invincible = run.effects.has('invincible');
      if (player.state.mode === 'run') {
        const hit = traffic.hitTest(player.state.x, player.state.z);
        if (hit) {
          if (hit.crashed || hit.speed < 1.5) {
            // A wreck or a queued car is a wall, not a death: push out.
            const pushX = player.state.x - hit.group.position.x;
            player.state.x += Math.sign(pushX || 1) * 0.12;
          } else if (invincible) {
            // The car comes off worse. This is what invincibility is FOR.
            crush.crash(hit);
            run.score += SCORE.perNearMiss;
            cameraRig.impulse(0.3);
          } else if (player.isVulnerable) {
            killPlayer(hit);
          }
        }
      }

      // The dead rest, then the game moves on.
      if (player.state.mode === 'dead' && player.bodyRestedFor > 1.5) {
        respawnOrEnd();
      }

      // Invincibility glow: flash the sprite gold-ish while it runs.
      if (invincible) {
        const pulse = 0.65 + Math.sin(performance.now() * 0.02) * 0.35;
        sprite.material.emissive?.setRGB(pulse * 0.5, pulse * 0.38, 0.05);
        sprite.material.emissiveIntensity = 0.9;
      } else if (sprite.material.emissiveIntensity !== 0) {
        sprite.material.emissive?.setRGB(0, 0, 0);
        sprite.material.emissiveIntensity = 0;
      }

      run.score += laser.update(dt, run.effects.has('laser'), player.state, cameraQuaternion);
      hud.setScore(run.score);
    } else {
      // Attract mode: traffic keeps flowing behind the title/game-over card.
      laser.update(dt, false, player.state, cameraQuaternion);
    }

    sprite.update(dt, player.state.speedRatio);
    traffic.update(dt, playing ? player.state : null, trafficEvents, crush);
    crush.update(dt);
    gore.update(dt, cameraQuaternion);
    powerups.update(dt, focus.x, focus.z, cameraQuaternion, playing ? pickupEvents : {});
    scenery.update(dt, cameraQuaternion);
    rain.update(dt, cameraRig.focus.x, cameraRig.focus.z - 6);

    cameraRig.update(dt, focus.x, focus.z, focus.vx || 0, focus.vz || 0);
    if (keyLight) trackKeyLight(keyLight, focus.x, focus.z);
  }

  // ---------------------------------------------------------- wiring ------

  hud.onPlay(() => startRun());
  hud.onAgain(() => startRun());

  return {
    update,
    buildStage,
    startRun,
    run,
    /** For the drives and the debug readout. */
    debug: {
      traffic, crush, gore, powerups, player, laser,
      /** Grants a power-up as if picked up. Lets the drives test each one. */
      grant(type) { pickupEvents.onPower(type); },
      kill() { killPlayer(null); },
    },
    /** Rebuild the current stage in place -- the context-loss recovery path. */
    rebuild() {
      buildStage(run.stage);
    },
    showTitle() {
      run.phase = 'title';
      buildStage(1);
      hud.show('title');
    },
  };
}
