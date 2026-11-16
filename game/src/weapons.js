// Neon Breach — weapons. Four tools, each with a price, a role and a
// spread/recoil model that punishes firing on the move: stopping to aim pays.
// Spread is radians of cone half-angle; recoil is radians of pitch kick.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'ARC-9 PISTOL', slot: 2, price: 0, auto: false,
    damage: 26, headMult: 2.0, magSize: 12, reserveMax: 36,
    interval: 0.16, reloadTime: 1.1, spreadBase: 0.012, spreadMove: 0.0016,
    recoil: 0.011, bloomPerShot: 0.004, bloomDecay: 0.05, range: 60,
    tracer: 0x8a5cff,
  },
  smg: {
    id: 'smg', name: 'VOLT SMG', slot: 1, price: 1500, auto: true,
    damage: 22, headMult: 2.0, magSize: 32, reserveMax: 96,
    interval: 0.075, reloadTime: 1.6, spreadBase: 0.02, spreadMove: 0.0022,
    recoil: 0.008, bloomPerShot: 0.003, bloomDecay: 0.045, range: 55,
    tracer: 0x22e6ff,
  },
  rifle: {
    id: 'rifle', name: 'NB-7 PULSE RIFLE', slot: 0, price: 2700, auto: true,
    damage: 34, headMult: 2.0, magSize: 30, reserveMax: 90,
    interval: 0.105, reloadTime: 2.2, spreadBase: 0.01, spreadMove: 0.0028,
    recoil: 0.016, bloomPerShot: 0.005, bloomDecay: 0.055, range: 80,
    tracer: 0xffb020,
  },
};

export const GRENADE = {
  id: 'grenade', name: 'FLUX GRENADE', price: 300,
  radius: 5.5, damageMax: 95, damageMin: 20, fuse: 1.6, throwSpeed: 17,
};

// One live weapon: its definition plus mutable ammo and bloom state.
export function makeWeapon(def) {
  return {
    def,
    mag: def.magSize,
    reserve: def.reserveMax,
    cooldown: 0,
    reloading: false,
    reloadLeft: 0,
    bloom: 0,
    // Last trigger state, for semi-auto edge detection.
    triggerWasDown: false,
  };
}

// Current spread for a shot, in radians. Moving fast, jumping and spraying
// all widen the cone; crouching and standing still tighten it.
export function currentSpread(w, speed, airborne, crouched) {
  let s = w.def.spreadBase + w.bloom + speed * w.def.spreadMove;
  if (airborne) s += 0.03;
  if (crouched) s *= 0.65;
  return Math.min(s, 0.12);
}

// Try to fire. Returns 'fire' | 'empty' | 'reload' | 'wait' | null.
// 'fire' means a round left the barrel; the caller resolves the hit.
export function tryFire(w, triggerDown, dt) {
  w.cooldown -= dt;
  w.bloom = Math.max(0, w.bloom - w.def.bloomDecay * dt);
  if (w.reloading) {
    w.reloadLeft -= dt;
    if (w.reloadLeft <= 0) {
      const need = w.def.magSize - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
      w.reloading = false;
    }
    return null;
  }
  const edge = triggerDown && !w.triggerWasDown;
  w.triggerWasDown = triggerDown;
  if (!w.def.auto && !edge) return null;
  if (!triggerDown) return null;
  if (w.cooldown > 0) return 'wait';
  if (w.mag <= 0) return 'empty';
  w.mag -= 1;
  w.cooldown = w.def.interval;
  w.bloom += w.def.bloomPerShot;
  return 'fire';
}

export function startReload(w) {
  if (w.reloading || w.mag === w.def.magSize || w.reserve <= 0) return false;
  w.reloading = true;
  w.reloadLeft = w.def.reloadTime;
  return true;
}

// Recoil pitch kick for one shot, in radians. The caller adds it to the
// camera pitch and lets it recover; a small random yaw drift is added too.
export function recoilKick(w) {
  return w.def.recoil * (0.9 + Math.random() * 0.2);
}
