// Neon Breach — VOID bots. Four defenders with routes, holds and reactions.
// A bot walks its route, holds its angle, and scans. It sees the player
// inside a vision cone with a clear line of sight, reacts after a short
// delay, then fights in bursts while strafing. Gunfire is noise: a bot that
// hears a shot walks over to look. When the bomb is planted the bots retake
// the site and the nearest one defuses.
import { NODES, ROUTES, findRoute, resolveCircle } from './map.js';
import { losBlocked } from './world.js';

export const BOT_NAMES = ['VEX', 'NULL', 'HEX', 'ORACLE'];
const BOT_SPEED = 3.4;
const BOT_ENGAGE_SPEED = 2.1;
const VISION_RANGE = 38;
const VISION_HALF_ANGLE = 1.31; // ~75 degrees
const EYE = 1.55;
const BOT_RADIUS = 0.42;

export function makeBot(id, spawn, routeName) {
  return {
    id,
    name: BOT_NAMES[id % BOT_NAMES.length],
    x: spawn[0],
    z: spawn[1],
    yaw: spawn[2],
    health: 100,
    alive: true,
    state: 'route', // route | hold | engage | investigate | retake | defuse | dead
    route: ROUTES[routeName].nodes.slice(),
    routeIdx: 0,
    holdYaw: ROUTES[routeName].holdYaw,
    // Combat state.
    lastSeenX: 0,
    lastSeenZ: 0,
    lastSeenAt: -99,
    reactionLeft: 0,
    burstLeft: 0,
    shootCooldown: 0,
    burstPause: 0,
    strafeDir: 1,
    strafeTimer: 0,
    scanPhase: Math.random() * Math.PI * 2,
    // Defuse state.
    defuseProgress: 0,
    // Scratch.
    _p: [0, 0],
    mesh: null,
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(bot, targetYaw, dt, rate) {
  const d = angleDiff(targetYaw, bot.yaw);
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  bot.yaw += step;
}

function moveToward(bot, tx, tz, speed, dt) {
  const dx = tx - bot.x;
  const dz = tz - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  const step = Math.min(dist, speed * dt);
  bot._p[0] = bot.x + (dx / dist) * step;
  bot._p[1] = bot.z + (dz / dist) * step;
  resolveCircle(bot._p, BOT_RADIUS);
  bot.x = bot._p[0];
  bot.z = bot._p[1];
  turnToward(bot, Math.atan2(-dx, -dz), dt, 7);
  return dist - step < 0.6;
}

// Can this bot see the player right now? Cone + range + line of sight.
// During the buy phase (freeze time) bots set up but never see or shoot.
function canSee(bot, ctx) {
  const p = ctx.player;
  if (ctx.freeze || !p.alive) return false;
  const dx = p.x - bot.x;
  const dz = p.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist > VISION_RANGE) return false;
  const toPlayer = Math.atan2(-dx, -dz);
  if (Math.abs(angleDiff(toPlayer, bot.yaw)) > VISION_HALF_ANGLE && dist > 4) return false;
  const eyeY = EYE;
  const targetY = p.crouched ? 0.9 : 1.35;
  return !losBlocked(ctx.solids, bot.x, eyeY, bot.z, p.x, targetY, p.z);
}

export function updateBot(bot, dt, ctx, now) {
  if (!bot.alive) return;
  const p = ctx.player;

  // --- Senses -------------------------------------------------------------
  const sees = canSee(bot, ctx);
  if (sees) {
    bot.lastSeenX = p.x;
    bot.lastSeenZ = p.z;
    bot.lastSeenAt = now;
    if (bot.state !== 'engage') {
      bot.state = 'engage';
      bot.reactionLeft = 0.28 + Math.random() * 0.25;
      bot.burstLeft = 0;
      bot.burstPause = 0;
    }
  }

  // Hearing: a recent gunshot inside earshot pulls a patrolling bot over.
  if ((bot.state === 'route' || bot.state === 'hold') && ctx.noise) {
    const n = ctx.noise;
    const d = Math.hypot(n.x - bot.x, n.z - bot.z);
    if (d < n.radius && now - n.at < 1.2) {
      bot.state = 'investigate';
      const nearest = nearestNode(n.x, n.z);
      bot.route = findRoute(nearestNode(bot.x, bot.z), nearest);
      bot.routeIdx = 0;
    }
  }

  // The bomb changes everyone's job: retake the site, then defuse.
  if (ctx.bombPlanted && bot.state !== 'engage' && bot.state !== 'defuse') {
    if (bot.state !== 'retake') {
      bot.state = 'retake';
      const siteNode = ctx.bombSite === 'A' ? 6 : 10;
      bot.route = findRoute(nearestNode(bot.x, bot.z), siteNode);
      bot.routeIdx = 0;
    }
  }

  // --- Behaviour ----------------------------------------------------------
  if (bot.state === 'engage') {
    updateEngage(bot, dt, ctx, now, sees);
  } else if (bot.state === 'defuse') {
    updateDefuse(bot, dt, ctx);
  } else if (bot.state === 'hold') {
    // Scan the held angle slowly, ±28 degrees around the hold yaw.
    bot.scanPhase += dt * 0.7;
    bot.yaw = bot.holdYaw + Math.sin(bot.scanPhase) * 0.5;
    if (now - bot.lastSeenAt > 6 && bot.state === 'hold') {
      // Nothing for a while: drift back to the route's hold is already home.
    }
  } else {
    // route / investigate / retake: walk the waypoint list.
    const target = NODES[bot.route[bot.routeIdx]];
    if (target) {
      const arrived = moveToward(bot, target[0], target[1], BOT_SPEED, dt);
      if (arrived) {
        bot.routeIdx += 1;
        if (bot.routeIdx >= bot.route.length) {
          if (bot.state === 'retake') {
            bot.state = 'defuse';
            bot.defuseProgress = 0;
          } else if (bot.state === 'investigate') {
            bot.state = 'hold';
            bot.holdYaw = bot.yaw;
            bot.scanPhase = 0;
          } else {
            bot.state = 'hold';
          }
        }
      }
    }
  }

  // --- Mesh follows the body ----------------------------------------------
  if (bot.mesh) {
    bot.mesh.position.set(bot.x, 0, bot.z);
    bot.mesh.rotation.y = bot.yaw;
    bot.mesh.visible = bot.alive;
  }
}

function updateEngage(bot, dt, ctx, now, sees) {
  const p = ctx.player;
  const dx = p.x - bot.x;
  const dz = p.z - bot.z;
  const dist = Math.hypot(dx, dz);
  const toPlayer = Math.atan2(-dx, -dz);
  turnToward(bot, toPlayer, dt, 9);

  // Strafe sideways while fighting, flipping direction every second or so.
  bot.strafeTimer -= dt;
  if (bot.strafeTimer <= 0) {
    bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
    bot.strafeTimer = 0.7 + Math.random() * 0.9;
  }
  const sx = Math.cos(bot.yaw) * bot.strafeDir;
  const sz = -Math.sin(bot.yaw) * bot.strafeDir;
  const wantClose = dist > 14;
  const wantFar = dist < 5;
  let mx = sx * 0.8;
  let mz = sz * 0.8;
  if (wantClose) {
    mx += (dx / dist) * 0.7;
    mz += (dz / dist) * 0.7;
  } else if (wantFar) {
    mx -= (dx / dist) * 0.7;
    mz -= (dz / dist) * 0.7;
  }
  const len = Math.hypot(mx, mz) || 1;
  bot._p[0] = bot.x + (mx / len) * BOT_ENGAGE_SPEED * dt;
  bot._p[1] = bot.z + (mz / len) * BOT_ENGAGE_SPEED * dt;
  resolveCircle(bot._p, BOT_RADIUS);
  bot.x = bot._p[0];
  bot.z = bot._p[1];

  // Lose the player: keep the last seen spot briefly, then go look.
  if (!sees && now - bot.lastSeenAt > 1.4) {
    bot.state = 'investigate';
    bot.route = findRoute(nearestNode(bot.x, bot.z), nearestNode(bot.lastSeenX, bot.lastSeenZ));
    bot.routeIdx = 0;
    return;
  }
  if (!p.alive) {
    bot.state = 'hold';
    bot.holdYaw = bot.yaw;
    return;
  }

  // Fire in bursts after the reaction delay.
  if (bot.reactionLeft > 0) {
    bot.reactionLeft -= dt;
    return;
  }
  bot.shootCooldown -= dt;
  if (bot.burstLeft <= 0) {
    bot.burstPause -= dt;
    if (bot.burstPause <= 0 && bot.shootCooldown <= 0) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.burstPause = 0.55 + Math.random() * 0.5;
    }
    return;
  }
  if (bot.shootCooldown <= 0) {
    bot.shootCooldown = 0.13;
    bot.burstLeft -= 1;
    ctx.botShoot(bot, dist, p);
  }
}

function updateDefuse(bot, dt, ctx) {
  const bomb = ctx.bomb;
  if (!bomb || !bomb.planted || bomb.defused || bomb.exploded) {
    bot.state = 'hold';
    bot.holdYaw = bot.yaw;
    return;
  }
  const d = Math.hypot(bomb.x - bot.x, bomb.z - bot.z);
  if (d > 1.6) {
    // Walked to the wrong spot: step to the bomb.
    moveToward(bot, bomb.x, bomb.z, BOT_SPEED, dt);
    return;
  }
  bot.defuseProgress += dt / 5; // 5 seconds to defuse.
  ctx.defuseProgress = Math.max(ctx.defuseProgress, bot.defuseProgress);
  if (bot.defuseProgress >= 1) {
    bomb.defused = true;
  }
}

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i][0] - x;
    const dz = NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function killBot(bot) {
  bot.alive = false;
  bot.state = 'dead';
  bot.health = 0;
  if (bot.mesh) {
    bot.mesh.rotation.x = -Math.PI / 2;
    bot.mesh.position.y = 0.25;
  }
}

export function resetBot(bot, spawn, routeName) {
  bot.x = spawn[0];
  bot.z = spawn[1];
  bot.yaw = spawn[2];
  bot.health = 100;
  bot.alive = true;
  bot.state = 'route';
  bot.route = ROUTES[routeName].nodes.slice();
  bot.routeIdx = 0;
  bot.holdYaw = ROUTES[routeName].holdYaw;
  bot.lastSeenAt = -99;
  bot.reactionLeft = 0;
  bot.burstLeft = 0;
  bot.shootCooldown = 0;
  bot.burstPause = 0;
  bot.defuseProgress = 0;
  if (bot.mesh) {
    bot.mesh.rotation.x = 0;
    bot.mesh.position.set(bot.x, 0, bot.z);
    bot.mesh.rotation.y = bot.yaw;
    bot.mesh.visible = true;
  }
}
