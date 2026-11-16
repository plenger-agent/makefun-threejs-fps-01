// Neon Breach — combat. Hitscan shots, headshots, bot fire and grenades.
// Shots are resolved against wall boxes and body/head spheres, nearest hit
// wins; a wall always beats a bot behind it. Everything here is pure math
// over the shared state — no three.js objects are created per shot.
import { COLLIDERS } from './map.js';
import { GRENADE } from './weapons.js';

// Ray vs an axis-aligned box. Returns the entry distance, or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, c, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const minX = c.cx - c.w / 2;
  const maxX = c.cx + c.w / 2;
  const minY = 0;
  const maxY = c.h;
  const minZ = c.cz - c.d / 2;
  const maxZ = c.cz + c.d / 2;
  const axes = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (let i = 0; i < 3; i++) {
    const [o, d, mn, mx] = axes[i];
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return Infinity;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Ray vs a sphere. Returns the entry distance, or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

// Nearest wall distance along a ray, or Infinity.
export function wallDistance(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, COLLIDERS[i], maxDist);
    if (t < best) best = t;
  }
  return best;
}

// The player's shot. `dir` is already spread; origin is the camera.
// Returns { kind, bot, head, x, y, z, dist } — kind is 'bot' | 'wall' | 'none'.
export function playerShot(ctx, ox, oy, oz, dx, dy, dz, damage, headMult) {
  const range = 90;
  let bestT = wallDistance(ox, oy, oz, dx, dy, dz, range);
  let bestBot = null;
  let bestHead = false;
  for (const bot of ctx.bots) {
    if (!bot.alive) continue;
    const headY = 1.72;
    const th = raySphere(ox, oy, oz, dx, dy, dz, bot.x, headY, bot.z, 0.3);
    if (th < bestT) {
      bestT = th;
      bestBot = bot;
      bestHead = true;
      continue;
    }
    // Bots stand on y=0: the body sphere is centred at chest height.
    const tb = raySphere(ox, oy, oz, dx, dy, dz, bot.x, 1.1, bot.z, 0.48);
    if (tb < bestT) {
      bestT = tb;
      bestBot = bot;
      bestHead = false;
    }
  }
  const hit = {
    x: ox + dx * bestT,
    y: oy + dy * bestT,
    z: oz + dz * bestT,
    dist: bestT,
    kind: bestBot ? 'bot' : bestT < Infinity ? 'wall' : 'none',
    bot: bestBot,
    head: bestHead,
  };
  if (bestBot) {
    const dmg = Math.round(damage * (bestHead ? headMult : 1));
    bestBot.health -= dmg;
    ctx.onBotHit(bestBot, dmg, bestHead, hit);
  }
  return hit;
}

// A bot's shot at the player. Accuracy falls with distance and with the
// player's speed, and rises while the player stands still to aim.
export function botShot(ctx, bot, dist) {
  const p = ctx.player;
  const speed = Math.hypot(p.vx, p.vz);
  let chance = 0.62 - dist * 0.008 - speed * 0.045;
  if (p.crouched) chance -= 0.05;
  chance = Math.max(0.08, Math.min(0.75, chance));
  const muzzle = { x: bot.x, y: 1.45, z: bot.z };
  const eyeY = p.crouched ? 1.12 : 1.62;
  const target = { x: p.x, y: eyeY - 0.25, z: p.z };
  // Normalise the direction, then check a wall stands between muzzle and target.
  const len = Math.hypot(target.x - muzzle.x, target.y - muzzle.y, target.z - muzzle.z) || 1;
  const wdx = (target.x - muzzle.x) / len;
  const wdy = (target.y - muzzle.y) / len;
  const wdz = (target.z - muzzle.z) / len;
  const blocked = wallDistance(muzzle.x, muzzle.y, muzzle.z, wdx, wdy, wdz, len) < len - 0.1;
  if (blocked) {
    const t = wallDistance(muzzle.x, muzzle.y, muzzle.z, wdx, wdy, wdz, len);
    ctx.onBotShot(bot, muzzle, { x: muzzle.x + wdx * t, y: muzzle.y + wdy * t, z: muzzle.z + wdz * t }, false, 0);
    return;
  }
  const hit = Math.random() < chance;
  if (hit) {
    const head = Math.random() < 0.12;
    const dmg = head ? 36 : 18;
    ctx.onPlayerHit(dmg, head, bot);
    ctx.onBotShot(bot, muzzle, target, true, dmg);
  } else {
    // Misses land near the player so the tracer still reads.
    const miss = {
      x: target.x + (Math.random() - 0.5) * 2.4,
      y: target.y + (Math.random() - 0.5) * 1.6,
      z: target.z + (Math.random() - 0.5) * 2.4,
    };
    ctx.onBotShot(bot, muzzle, miss, false, 0);
  }
}

// --- Grenades ---------------------------------------------------------------
export function makeGrenades() {
  return [];
}

export function throwGrenade(list, from, dir) {
  list.push({
    x: from.x, y: from.y, z: from.z,
    vx: dir.x * GRENADE.throwSpeed,
    vy: dir.y * GRENADE.throwSpeed + 3.5,
    vz: dir.z * GRENADE.throwSpeed,
    fuse: GRENADE.fuse,
    alive: true,
  });
}

export function stepGrenades(list, dt, ctx) {
  for (const g of list) {
    if (!g.alive) continue;
    g.fuse -= dt;
    g.vy -= 14 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    if (g.y <= 0.12) {
      g.y = 0.12;
      g.vy = Math.abs(g.vy) * 0.35;
      g.vx *= 0.7;
      g.vz *= 0.7;
      if (Math.abs(g.vy) < 0.8) g.vy = 0;
    }
    // Walls stop the grenade cold (cheap, reads fine at this scale).
    for (const c of COLLIDERS) {
      if (g.y < c.h && Math.abs(g.x - c.cx) < c.w / 2 + 0.15 && Math.abs(g.z - c.cz) < c.d / 2 + 0.15) {
        g.vx *= -0.3;
        g.vz *= -0.3;
        g.x += g.vx * dt * 2;
        g.z += g.vz * dt * 2;
      }
    }
    if (g.fuse <= 0) {
      g.alive = false;
      ctx.onGrenadeExplode(g);
      explodeAt(ctx, g.x, g.y, g.z);
    }
  }
  // Compact the list in place.
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].alive) list.splice(i, 1);
  }
}

function explodeAt(ctx, x, y, z) {
  const p = ctx.player;
  const pd = Math.hypot(p.x - x, p.z - z);
  if (p.alive && pd < GRENADE.radius) {
    const dmg = Math.round(GRENADE.damageMax - (GRENADE.damageMax - GRENADE.damageMin) * (pd / GRENADE.radius));
    ctx.onPlayerHit(dmg, false, null);
  }
  for (const bot of ctx.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.x - x, bot.z - z);
    if (d < GRENADE.radius) {
      const dmg = Math.round(GRENADE.damageMax - (GRENADE.damageMax - GRENADE.damageMin) * (d / GRENADE.radius));
      bot.health -= dmg;
      ctx.onBotHit(bot, dmg, false, { x: bot.x, y: 1.2, z: bot.z });
    }
  }
}
