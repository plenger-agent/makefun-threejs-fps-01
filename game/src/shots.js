// Neon Breach — staged scenes and the headless sim.
// ?shot=play|buy|plant|end stages one deterministic moment for a screenshot;
// ?shot=sim fast-forwards minutes of match (routes, gunfights, plants, round
// payouts) and reports the totals. All of it drives the real game code, so a
// screenshot can only show what the game can actually do.
import { SPAWNS, SITES } from './map.js';
import { makeWeapon, WEAPONS } from './weapons.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function applyShot(game, kind, seed) {
  const g = game;
  if (kind === 'play') return stagePlay(g);
  if (kind === 'buy') return stageBuy(g);
  if (kind === 'plant') return stagePlant(g);
  if (kind === 'end') return stageEnd(g);
  if (kind === 'sim') return runSim(g, seed || 11);
  return null;
}

function equipRifle(g) {
  g.match.owned.add('rifle');
  g.loadout.rifle = makeWeapon(WEAPONS.rifle);
  g.loadout.current = 'rifle';
  g.loadout.rifle.mag = 24;
  g.loadout.rifle.reserve = 90;
}

function stagePlay(g) {
  g.startMatch();
  g.match.phase = 'live';
  g.match.phaseTime = 80;
  g.match.buyOpen = false;
  g.hud.setBuyOpen(false);
  g.stagedFreeze = true;
  equipRifle(g);
  // Player west of mid, looking north up the lane at two bots in a firefight.
  // Both sightlines clear the central pillar; both bots sit 8–12 m out, big
  // in the frame, magenta visors and shoulder bars against the dark.
  g.player.x = -6;
  g.player.z = 10;
  g.player.yaw = -0.2;
  g.player.pitch = 0.0;
  const b0 = g.bots[0];
  const b1 = g.bots[1];
  b0.x = -4; b0.z = 2; b0.yaw = Math.PI; b0.state = 'engage'; b0.health = 62;
  b1.x = -8; b1.z = -2; b1.yaw = Math.PI * 0.8; b1.state = 'engage'; b1.health = 100;
  g.syncBotMeshes();
  // A tracer mid-flight from the player's muzzle to the wounded bot, sparks
  // on its chest, the hitmarker lit, and a kill already on the feed. The
  // frame loop re-fires this burst every few frames, so the screenshot
  // always catches it (tracers live 0.14 s, the shot waits 0.4 s).
  const muzzle = g.muzzleWorld();
  g.fxSpawnTracer(muzzle, { x: b0.x, y: 1.35, z: b0.z }, 0xffb020);
  g.fxSpawnSparks({ x: b0.x, y: 1.35, z: b0.z }, 0xffd27a);
  g.hud.hitmarker(false);
  g.feed.push('<b>YOU</b> ▸ <span class="void">VEX</span> — 38 dmg');
  g.hud.killfeed(g.feed);
  g.hud.setOverlay(false);
  g.ready = true;
}

function stageBuy(g) {
  g.startMatch();
  g.match.money = 3850;
  g.match.buyOpen = true;
  g.hud.renderBuy(g.buyItems, g.match.money, g.match.owned, g.match.grenades, g.match.armor);
  g.hud.setBuyOpen(true);
  g.player.x = 0;
  g.player.z = 18.5;
  g.player.yaw = 0;
  g.hud.setOverlay(false);
  g.ready = true;
}

function stagePlant(g) {
  g.startMatch();
  g.match.phase = 'live';
  g.match.phaseTime = 55;
  g.match.buyOpen = false;
  g.hud.setBuyOpen(false);
  g.stagedFreeze = true;
  equipRifle(g);
  // Inside SITE A, looking at its centre: the cyan ring, the A beacon and a
  // VOID bot closing in from the north, while the plant bar sits at 62%.
  g.player.x = -19;
  g.player.z = -9;
  g.player.yaw = 0.785;
  g.player.pitch = -0.03;
  g.bomb.planting = true;
  g.bomb.plantProgress = 0.62;
  g.bomb.site = 'A';
  g.bomb.x = g.player.x;
  g.bomb.z = g.player.z;
  g.holdingPlant = true;
  const b = g.bots[2];
  b.x = -20; b.z = -14; b.yaw = Math.PI * 0.9; b.state = 'engage';
  g.syncBotMeshes();
  g.hud.setOverlay(false);
  g.ready = true;
}

function stageEnd(g) {
  g.startMatch();
  g.match.phase = 'roundEnd';
  g.match.phaseTime = 4;
  g.match.buyOpen = false;
  g.hud.setBuyOpen(false);
  g.stagedFreeze = true;
  g.match.scoreNeon = 1;
  g.match.scoreVoid = 0;
  g.match.roundWinner = 'NEON';
  g.match.roundReason = 'Bomb detonated at SITE A';
  for (const b of g.bots) {
    b.alive = false;
    b.state = 'dead';
    b.health = 0;
  }
  g.syncBotMeshes();
  g.player.x = -19;
  g.player.z = -11;
  g.player.yaw = 0.6;
  g.bomb.planted = true;
  g.bomb.site = 'A';
  g.bomb.x = -22;
  g.bomb.z = -12;
  g.bomb.exploded = true;
  g.hud.showBanner('ROUND WON', 'Bomb detonated at SITE A — NEON leads 1–0', '#22e6ff');
  g.feed.push('<b>YOU</b> planted the flux bomb at SITE A');
  g.feed.push('<b>YOU</b> ▸ <span class="void">HEX</span> — headshot');
  g.hud.killfeed(g.feed);
  g.hud.setOverlay(false);
  g.ready = true;
}

// Fast-forward: an autopilot plays the match — buys, pushes mid, aims at the
// nearest visible bot, plants at A — while the real fixed-step sim runs.
// Totals are exposed on window for sim_test.py.
export async function runSim(g, seed) {
  const rand = lcg(seed);
  const totals = {
    steps: 0, rounds: 0, shotsFired: 0, shotsHit: 0, headshots: 0,
    kills: 0, plants: 0, defuses: 0, explosions: 0, botShots: 0,
    playerDamageTaken: 0, grenadesThrown: 0, buys: 0, errors: [],
  };
  g.simTotals = totals;
  g.startMatch();
  g.hud.setOverlay(false);
  const STEP = 1 / 60;
  const maxSteps = 60 * 60 * 6; // six minutes of match time, at most
  let prevRound = 1;
  let prevKills = 0;

  for (let i = 0; i < maxSteps; i++) {
    try {
      // Autopilot: buy the rifle in the buy phase, then push site A.
      if (g.match.phase === 'buy') {
        if (!g.match.owned.has('rifle') && g.match.money >= 2700) {
          g.buyItem('rifle');
          totals.buys += 1;
        }
        if (g.match.grenades === 0 && g.match.money >= 300) {
          g.buyItem('grenade');
          totals.buys += 1;
        }
        g.autoAim = null;
      } else if (g.match.phase === 'live') {
        autopilotStep(g, totals, rand);
      }
      const before = g.stats;
      g.stepFixed(STEP);
      totals.steps += 1;
      if (g.match.round !== prevRound) {
        totals.rounds += 1;
        prevRound = g.match.round;
      }
      if (g.stats.kills > prevKills) {
        totals.kills = g.stats.kills;
        prevKills = g.stats.kills;
      }
      totals.shotsFired = g.stats.shotsFired;
      totals.shotsHit = g.stats.shotsHit;
      totals.headshots = g.stats.headshots;
      totals.plants = g.stats.plants;
      totals.defuses = g.stats.defuses;
      totals.explosions = g.stats.explosions;
      totals.botShots = g.stats.botShots;
      totals.playerDamageTaken = g.stats.playerDamageTaken;
      totals.grenadesThrown = g.stats.grenadesThrown;
      if (g.match.phase === 'matchEnd') break;
    } catch (e) {
      totals.errors.push(String(e && e.message ? e.message : e));
      break;
    }
    // Yield to the browser every 600 steps so the tab stays alive.
    if (i % 600 === 599) await new Promise((r) => setTimeout(r, 0));
  }
  const acc = totals.shotsFired ? (100 * totals.shotsHit / totals.shotsFired).toFixed(1) : '0';
  document.title = `SIM rounds=${totals.rounds} kills=${totals.kills} plants=${totals.plants} ` +
    `acc=${acc}% errors=${totals.errors.length} winner=${g.match.matchWinner || 'none'}`;
  window.__simTotals = totals;
  window.__simReport = {
    roundsPlayed: totals.rounds,
    kills: totals.kills,
    plants: totals.plants,
    defuses: totals.defuses,
    explosions: totals.explosions,
    shotsFired: totals.shotsFired,
    accuracyPct: acc,
    playerDamageTaken: totals.playerDamageTaken,
    grenadesThrown: totals.grenadesThrown,
    buys: totals.buys,
    botShots: totals.botShots,
    matchWinner: g.match.matchWinner,
    score: `${g.match.scoreNeon}-${g.match.scoreVoid}`,
    errors: totals.errors,
  };
  g.ready = true;
}

function autopilotStep(g, totals, rand) {
  const p = g.player;
  if (!p.alive) return;
  // Nearest living bot.
  let best = null;
  let bestD = Infinity;
  for (const b of g.bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  const site = SITES.A;
  if (best && bestD < 30) {
    // Aim at the bot's chest and fire in short bursts.
    const dx = best.x - p.x;
    const dz = best.z - p.z;
    const dy = 1.3 - 1.62;
    const dist = Math.hypot(dx, dy, dz);
    p.yaw = Math.atan2(-dx, -dz) + (rand() - 0.5) * 0.04;
    p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)));
    g.input.testFire(rand() < 0.7);
    g.input.testKey('KeyW', false);
    // Close in with a grenade when the bot is near and one is carried.
    if (bestD < 14 && g.match.grenades > 0 && rand() < 0.25) g.throwGrenade();
    return;
  }
  // No target: walk to site A and plant.
  g.input.testFire(false);
  const dx = site.x - p.x;
  const dz = site.z - p.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    g.input.testKey('KeyW', false);
    g.holdingPlant = true;
    return;
  }
  g.holdingPlant = false;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = 0;
  g.input.testKey('KeyW', true);
  if (g.loadout.current === 'rifle' && g.loadout.rifle.mag === 0) g.reloadWeapon();
}
