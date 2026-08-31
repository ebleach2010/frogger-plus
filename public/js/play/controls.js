// Touch steering, plus a keyboard path.
//
// Eric picked "hold and steer, free sprint": your thumb goes down anywhere on
// the screen and he runs in that direction, analog, at a speed set by how far
// you have pulled. There is no on-screen stick drawn, because on a 390pt-wide
// phone a visible stick eats the road.
//
// Two details make this feel right rather than fiddly:
//
//   1. The origin floats. Once you drag past MAX_RADIUS the origin is dragged
//      along behind your thumb, so a long swipe never runs out of stick and
//      you can keep steering without lifting off.
//   2. There is a dead zone. Without it, resting a thumb makes him twitch, and
//      a twitch in traffic costs a heart.
//
// The keyboard path exists so the automated drives can genuinely play the
// game rather than only take screenshots of it. It reports the same shape.

const MAX_RADIUS = 58; // CSS px to full speed
const DEAD_ZONE = 5;

/**
 * @returns {{
 *   read: () => { x: number, y: number, magnitude: number, active: boolean },
 *   attach: () => void,
 *   detach: () => void,
 *   isTouching: () => boolean,
 * }}
 */
export function createControls(target) {
  const state = { x: 0, y: 0, magnitude: 0, active: false };

  let pointerId = null;
  let originX = 0;
  let originY = 0;

  const keys = new Set();

  function setFromVector(dx, dy) {
    const length = Math.hypot(dx, dy);

    if (length < DEAD_ZONE) {
      state.x = 0;
      state.y = 0;
      state.magnitude = 0;
      return;
    }

    state.x = dx / length;
    state.y = dy / length;
    state.magnitude = Math.min(1, (length - DEAD_ZONE) / (MAX_RADIUS - DEAD_ZONE));
  }

  function onPointerDown(event) {
    // Ignore presses that land on a button; the screens need their taps.
    if (event.target.closest('button')) return;
    if (pointerId !== null) return;

    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    state.active = true;
    setFromVector(0, 0);

    target.setPointerCapture?.(pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (event.pointerId !== pointerId) return;

    let dx = event.clientX - originX;
    let dy = event.clientY - originY;
    const length = Math.hypot(dx, dy);

    // Floating origin: drag the anchor along so the stick never bottoms out.
    if (length > MAX_RADIUS) {
      const pull = (length - MAX_RADIUS) / length;
      originX += dx * pull;
      originY += dy * pull;
      dx = event.clientX - originX;
      dy = event.clientY - originY;
    }

    setFromVector(dx, dy);
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (event.pointerId !== pointerId) return;
    release();
    event.preventDefault();
  }

  function release() {
    if (pointerId !== null) target.releasePointerCapture?.(pointerId);
    pointerId = null;
    state.active = false;
    state.magnitude = 0;
    state.x = 0;
    state.y = 0;
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    applyKeys();
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
    applyKeys();
  }

  function applyKeys() {
    const up = keys.has('arrowup') || keys.has('w');
    const down = keys.has('arrowdown') || keys.has('s');
    const left = keys.has('arrowleft') || keys.has('a');
    const right = keys.has('arrowright') || keys.has('d');

    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);

    if (dx === 0 && dy === 0) {
      // Only a key release should stop him; a live touch still owns the state.
      if (pointerId === null) {
        state.active = false;
        state.magnitude = 0;
        state.x = 0;
        state.y = 0;
      }
      return;
    }

    const length = Math.hypot(dx, dy);
    state.x = dx / length;
    state.y = dy / length;
    state.magnitude = 1;
    state.active = true;
  }

  // A backgrounded tab must not leave him sprinting into traffic forever.
  function onBlur() {
    keys.clear();
    release();
  }

  function attach() {
    target.addEventListener('pointerdown', onPointerDown, { passive: false });
    target.addEventListener('pointermove', onPointerMove, { passive: false });
    target.addEventListener('pointerup', onPointerUp, { passive: false });
    target.addEventListener('pointercancel', onPointerUp, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
  }

  function detach() {
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onBlur);
  }

  return {
    read: () => state,
    attach,
    detach,
    isTouching: () => pointerId !== null,
  };
}
