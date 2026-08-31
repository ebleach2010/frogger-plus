// The HUD and screens: plain DOM over the canvas.
//
// Hearts top-left as ordered, score top-centre, coins and stage top-right,
// live power-up timers along the bottom, and a toast lane through the middle
// for stage banners. This module owns every DOM read/write in the game, so
// the play modules never touch the document.

import { POWERUPS, PLAYER } from '../config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);

  const hud = el('hud');
  const hearts = el('hearts');
  const scoreEl = el('score');
  const coinsEl = el('coins');
  const stageEl = el('stage-label');
  const powerupsEl = el('powerups');
  const toastEl = el('toast');

  const screens = {
    title: el('screen-title'),
    over: el('screen-over'),
    loading: el('screen-loading'),
  };

  // Build the heart row once; damage just toggles classes.
  const heartEls = [];
  for (let i = 0; i < PLAYER.maxLives; i += 1) {
    const heart = document.createElement('div');
    heart.className = 'heart';
    hearts.appendChild(heart);
    heartEls.push(heart);
  }

  let shownScore = -1;
  let shownCoins = -1;
  let toastTimer = null;

  /** Active power-up chips, keyed by type: { root, bar, remaining, total } */
  const chips = new Map();

  function setLives(lives, { popped = false, gained = false } = {}) {
    heartEls.forEach((heart, i) => {
      const spent = i >= lives;
      if (spent && !heart.classList.contains('is-spent') && popped && i === lives) {
        heart.classList.add('is-popping');
        setTimeout(() => heart.classList.remove('is-popping'), 460);
      }
      if (!spent && heart.classList.contains('is-spent') && gained && i === lives - 1) {
        heart.classList.add('is-gained');
        setTimeout(() => heart.classList.remove('is-gained'), 560);
      }
      heart.classList.toggle('is-spent', spent);
    });
  }

  function setScore(score) {
    const rounded = Math.floor(score);
    if (rounded === shownScore) return;
    shownScore = rounded;
    scoreEl.textContent = rounded.toLocaleString('en-US');
  }

  function setCoins(coins) {
    if (coins === shownCoins) return;
    shownCoins = coins;
    coinsEl.textContent = String(coins);
  }

  function setStage(stage) {
    stageEl.textContent = `STAGE ${stage}`;
  }

  function toast(text, color) {
    toastEl.textContent = text;
    toastEl.style.color = color || '';
    toastEl.classList.remove('is-on');
    // Reflow so the animation restarts even for back-to-back toasts.
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 1600);
  }

  function powerOn(type) {
    const spec = POWERUPS[type];
    if (!spec || spec.seconds <= 0) return;

    let chip = chips.get(type);
    if (!chip) {
      const root = document.createElement('div');
      root.className = 'pu';
      root.style.setProperty('--pu-color', spec.color);
      const ring = document.createElement('div');
      ring.className = 'pu-ring';
      ring.textContent = spec.glyph;
      const bar = document.createElement('div');
      bar.className = 'pu-bar';
      const fill = document.createElement('span');
      bar.appendChild(fill);
      root.append(ring, bar);
      powerupsEl.appendChild(root);
      chip = { root, fill };
      chips.set(type, chip);
    }
    chip.remaining = spec.seconds;
    chip.total = spec.seconds;
  }

  function powerTick(dt) {
    for (const [type, chip] of chips) {
      chip.remaining -= dt;
      if (chip.remaining <= 0) {
        chip.root.remove();
        chips.delete(type);
        continue;
      }
      chip.fill.style.transform = `scaleX(${Math.max(0, chip.remaining / chip.total)})`;
    }
  }

  function powerClear() {
    for (const [, chip] of chips) chip.root.remove();
    chips.clear();
  }

  /** Game over readouts. */
  function setResults({ score, best, stage, coins }) {
    el('over-score').textContent = Math.floor(score).toLocaleString('en-US');
    el('over-best').textContent = Math.floor(best).toLocaleString('en-US');
    el('over-stage').textContent = String(stage);
    el('over-coins').textContent = String(coins);
  }

  return {
    setLives,
    setScore,
    setCoins,
    setStage,
    toast,
    powerOn,
    powerTick,
    powerClear,
    setResults,
    /** 'title' | 'over' | 'loading' | 'none' (playing, HUD visible) */
    show(name) {
      for (const [key, screen] of Object.entries(screens)) {
        screen.classList.toggle('is-on', key === name);
      }
      hud.hidden = name !== 'none';
    },
    onPlay(fn) { el('btn-play').addEventListener('click', fn); },
    onAgain(fn) { el('btn-again').addEventListener('click', fn); },
  };
}
