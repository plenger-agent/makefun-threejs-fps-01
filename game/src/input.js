// Neon Breach — input. Keyboard state, mouse look deltas, pointer lock and
// the fire trigger. The game also exposes `test` hooks so the headless sim
// can drive the same code paths without a real pointer.
export function createInput(canvas, callbacks) {
  const keys = new Set();
  const state = {
    keys,
    lookDX: 0,
    lookDY: 0,
    firing: false,
    locked: false,
    // Edge-triggered actions, consumed once per fixed step by main.js.
    pressed: new Set(),
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    state.pressed.add(e.code);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyB' && callbacks.onBuy) callbacks.onBuy();
    if (e.code === 'Digit1' && callbacks.onSlot) callbacks.onSlot(0);
    if (e.code === 'Digit2' && callbacks.onSlot) callbacks.onSlot(1);
    if (e.code === 'Digit3' && callbacks.onSlot) callbacks.onSlot(2);
    if (e.code === 'Digit4' && callbacks.onSlot) callbacks.onSlot(3);
    if (e.code === 'KeyR' && callbacks.onReload) callbacks.onReload();
    if (e.code === 'KeyG' && callbacks.onGrenade) callbacks.onGrenade();
    if (e.code === 'KeyE' && callbacks.onInteract) callbacks.onInteract();
    if (e.code === 'Enter' && callbacks.onConfirm) callbacks.onConfirm();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!state.locked) return;
    state.lookDX += e.movementX || 0;
    state.lookDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      if (!state.locked) {
        if (callbacks.onRequestLock) callbacks.onRequestLock();
      } else {
        state.firing = true;
      }
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
  }
  function onLockChange() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) state.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  state.requestLock = () => {
    try {
      canvas.requestPointerLock();
    } catch {
      // Headless browsers refuse pointer lock; the game still renders.
    }
  };
  // Test hook: pretend the pointer is locked and inject a look delta.
  state.testLook = (dx, dy) => {
    state.locked = true;
    state.lookDX += dx;
    state.lookDY += dy;
  };
  state.testFire = (on) => {
    state.firing = on;
  };
  state.testKey = (code, down) => {
    if (down) {
      keys.add(code);
      state.pressed.add(code);
    } else {
      keys.delete(code);
    }
  };
  state.consumeLook = () => {
    const dx = state.lookDX;
    const dy = state.lookDY;
    state.lookDX = 0;
    state.lookDY = 0;
    return [dx, dy];
  };
  state.consumePressed = () => {
    const out = state.pressed;
    state.pressed = new Set();
    return out;
  };
  return state;
}
