// Neon Breach — main. Boots the renderer, runs the fixed-step simulation
// (60 Hz, kept apart from rendering), wires input, combat, bots, the bomb,
// rounds and the HUD together, and exposes the debug handles the sim test
// reads. The simulation never allocates in its hot loop: scratch vectors and
// a persistent HUD state object are reused every frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SPAWNS, SITES, COLLIDERS, NODES, EDGES, ROUTES } from './map.js';
import { buildWorld, losBlocked, makeBotMesh, makeViewmodel } from './world.js';
import { createInput } from './input.js';
import { makePlayer, stepPlayer, damagePlayer, eyeHeight, forwardOf } from './player.js';
import { WEAPONS, GRENADE, makeWeapon, tryFire, startReload, currentSpread, recoilKick } from './weapons.js';
import { makeBot, updateBot, killBot, resetBot, BOT_NAMES } from './bots.js';
import { playerShot, botShot, makeGrenades, throwGrenade, stepGrenades } from './combat.js';
import { makeBomb, updatePlant, updateFuse, resetBomb } from './bomb.js';
import { makeMatch, startMatch, startRound, endRound, tickPhase, buy, award, BUY_ITEMS } from './rounds.js';
import { makeEffects, spawnTracer, spawnSparks, spawnExplosion, spawnMuzzle, addTrauma, updateEffects, shakeOffset } from './effects.js';
import { createHud } from './hud.js';
import { applyShot } from './shots.js';

const STEP = 1 / 60;
const BOT_ROUTES = ['holdA', 'holdB', 'holdMid', 'patrol'];

const tmpDir = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const tmpShake = [0, 0];
const tmpForward = new THREE.Vector3();

function createGame() {
  const container = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const { solids, flash } = buildWorld(scene);
  const viewmodel = makeViewmodel();
  camera.add(viewmodel);

  const hud = createHud(document);
  const fx = makeEffects(scene, flash);
  const match = makeMatch();
  const player = makePlayer(SPAWNS.attacker[0]);
  const bomb = makeBomb();
  const grenades = makeGrenades();

  const bots = BOT_ROUTES.map((route, i) => {
    const bot = makeBot(i, SPAWNS.defender[i], route);
    bot.mesh = makeBotMesh(PALETTE.neonMagenta);
    scene.add(bot.mesh);
    return bot;
  });

  const g = {
    scene, camera, renderer, hud, fx, match, player, bots, bomb, grenades,
    solids, viewmodel,
    loadout: { pistol: makeWeapon(WEAPONS.pistol), smg: null, rifle: null, current: 'pistol' },
    stats: {
      shotsFired: 0, shotsHit: 0, headshots: 0, kills: 0, plants: 0,
      defuses: 0, explosions: 0, botShots: 0, playerDamageTaken: 0, grenadesThrown: 0,
    },
    feed: [],
    noise: null,
    now: 0,
    holdingPlant: false,
    staged: false,
    ready: false,
    buyItems: BUY_ITEMS,
    // Persistent HUD state: mutated, never re-created.
    hudState: {
      health: 100, armor: 0, mag: 12, reserve: 36, weaponName: 'ARC-9 PISTOL',
      grenades: 0, timeLeft: 100, round: 1, scoreNeon: 0, scoreVoid: 0, money: 800,
      spread: 0.01, plantProgress: 0, planting: false, plantSite: 'A',
      bombPlanted: false, fuseLeft: 0, hint: '',
    },
  };

  // --- Combat context: what combat.js and bots.js call back into -----------
  const ctx = {
    player,
    bots,
    solids,
    bomb,
    get bombPlanted() { return bomb.planted; },
    get bombSite() { return bomb.site; },
    // Freeze time: during the buy phase bots walk to their holds but never
    // see or shoot, so the player cannot be killed before the round starts.
    get freeze() { return match.phase === 'buy'; },
    get noise() { return g.noise; },
    get defuseProgress() { return g.defuseProgress || 0; },
    set defuseProgress(v) { g.defuseProgress = v; },
    botShoot(bot, dist) {
      g.stats.botShots += 1;
      botShot(ctx, bot, dist);
    },
    onBotHit(bot, dmg, head, hit) {
      g.stats.shotsHit += 1;
      if (head) g.stats.headshots += 1;
      hud.hitmarker(head);
      spawnSparks(fx, hit, head ? 0xff3b30 : 0xffd27a);
      if (bot.health <= 0) {
        killBot(bot);
        g.stats.kills += 1;
        award(match, 300, `Eliminated ${bot.name}`);
        g.feed.push(`<b>YOU</b> ▸ <span class="void">${bot.name}</span>${head ? ' — headshot' : ''}`);
        if (g.feed.length > 5) g.feed.shift();
        hud.killfeed(g.feed);
      }
    },
    onPlayerHit(dmg, head, bot) {
      const dealt = damagePlayer(player, dmg);
      g.stats.playerDamageTaken += dealt;
      hud.damageFlash();
      addTrauma(fx, 0.35);
      if (!player.alive) {
        g.feed.push(`<span class="void">${bot ? bot.name : 'FLUX BLAST'}</span> ▸ <b>YOU</b>${head ? ' — headshot' : ''}`);
        hud.killfeed(g.feed);
      }
    },
    onBotShot(bot, muzzle, target, hit, dmg) {
      spawnTracer(fx, muzzle, target, 0xff2e88);
      spawnMuzzle(fx, muzzle);
      g.noise = { x: bot.x, z: bot.z, radius: 26, at: g.now };
    },
    onGrenadeExplode(gr) {
      spawnExplosion(fx, { x: gr.x, y: gr.y, z: gr.z });
      g.noise = { x: gr.x, z: gr.z, radius: 30, at: g.now };
    },
  };
  g.ctx = ctx;

  // --- Player actions -------------------------------------------------------
  g.currentWeapon = () => g.loadout[g.loadout.current];

  g.muzzleWorld = () => {
    forwardOf(player.yaw, player.pitch, tmpForward);
    tmpMuzzle.copy(camera.position).addScaledVector(tmpForward, 0.7);
    tmpMuzzle.y -= 0.12;
    return { x: tmpMuzzle.x, y: tmpMuzzle.y, z: tmpMuzzle.z };
  };

  g.fxSpawnTracer = (from, to, color) => spawnTracer(fx, from, to, color);
  g.fxSpawnSparks = (at, color) => spawnSparks(fx, at, color);

  g.reloadWeapon = () => {
    const w = g.currentWeapon();
    if (startReload(w)) g.hudState.weaponName = `${w.def.name} — RELOADING`;
  };

  g.buyItem = (id) => {
    if (buy(match, id)) {
      if (id === 'rifle') g.loadout.rifle = makeWeapon(WEAPONS.rifle);
      if (id === 'smg') g.loadout.smg = makeWeapon(WEAPONS.smg);
      if (id === 'grenade') match.grenades = match.grenades; // count lives on match
      if (id === 'armor') player.armor = 50;
      if ((id === 'rifle' || id === 'smg') && g.loadout.current === 'pistol') g.loadout.current = id;
      hud.renderBuy(BUY_ITEMS, match.money, match.owned, match.grenades, match.armor);
      return true;
    }
    return false;
  };

  g.selectSlot = (slot) => {
    const ids = ['rifle', 'smg', 'pistol'];
    const id = ids[slot];
    if (id && g.loadout[id]) g.loadout.current = id;
  };

  g.throwGrenade = () => {
    if (match.phase !== 'live' || !player.alive || match.grenades <= 0) return;
    match.grenades -= 1;
    g.stats.grenadesThrown += 1;
    forwardOf(player.yaw, player.pitch, tmpForward);
    const from = { x: player.x, y: eyeHeight(player), z: player.z };
    throwGrenade(grenades, from, { x: tmpForward.x, y: tmpForward.y, z: tmpForward.z });
    g.noise = { x: player.x, z: player.z, radius: 18, at: g.now };
  };

  g.startMatch = () => {
    startMatch(match);
    resetPositions();
    hud.hideBanner();
    hud.hideMatch();
    hud.setBuyOpen(true);
    hud.renderBuy(BUY_ITEMS, match.money, match.owned, match.grenades, match.armor);
    hud.setOverlay(false);
  };

  function resetPositions() {
    const s = SPAWNS.attacker[0];
    player.x = s[0];
    player.z = s[1];
    player.yaw = s[2];
    player.pitch = 0;
    player.vx = 0;
    player.vz = 0;
    player.health = 100;
    player.armor = match.armor;
    player.alive = true;
    player.crouched = false;
    resetBomb(bomb);
    g.defuseProgress = 0;
    bots.forEach((bot, i) => resetBot(bot, SPAWNS.defender[i], BOT_ROUTES[i]));
    for (const id of ['pistol', 'smg', 'rifle']) {
      const w = g.loadout[id];
      if (w) {
        w.mag = w.def.magSize;
        w.reserve = w.def.reserveMax;
        w.reloading = false;
        w.bloom = 0;
      }
    }
    g.feed = [];
    hud.killfeed([]);
    // A gunshot from the last round must not pull bots in the next one.
    g.noise = null;
  }
  g.resetPositions = resetPositions;

  g.syncBotMeshes = () => {
    for (const bot of bots) {
      if (!bot.mesh) continue;
      bot.mesh.position.set(bot.x, 0, bot.z);
      bot.mesh.rotation.y = bot.yaw;
      bot.mesh.rotation.x = bot.alive ? 0 : -Math.PI / 2;
      bot.mesh.visible = true;
    }
  };

  // --- Input ------------------------------------------------------------------
  const input = createInput(renderer.domElement, {
    onRequestLock: () => input.requestLock(),
    onBuy: () => {
      if (match.phase !== 'buy') return;
      match.buyOpen = !match.buyOpen;
      hud.setBuyOpen(match.buyOpen);
      if (match.buyOpen) hud.renderBuy(BUY_ITEMS, match.money, match.owned, match.grenades, match.armor);
    },
    onSlot: (slot) => g.selectSlot(slot),
    onReload: () => g.reloadWeapon(),
    onGrenade: () => g.throwGrenade(),
    onInteract: () => { g.holdingPlant = true; },
    onConfirm: () => {
      if (match.phase === 'matchEnd') g.startMatch();
    },
  });
  g.input = input;
  document.addEventListener('neon-buy', (e) => g.buyItem(e.detail));
  document.getElementById('play').addEventListener('click', () => {
    if (match.phase === 'menu') g.startMatch();
    input.requestLock();
  });
  const again = document.getElementById('play-again');
  if (again) again.addEventListener('click', () => g.startMatch());
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') g.holdingPlant = false;
  });

  // --- One fixed step ---------------------------------------------------------
  g.stepFixed = (dt) => {
    g.now += dt;
    // A staged screenshot freezes the simulation: the scene holds its pose
    // (the plant bar stays at 62%, the round-end banner stays up) while the
    // renderer keeps drawing. Only the effects keep ticking, below.
    if (g.stagedFreeze) {
      updateEffects(fx, dt);
      return;
    }
    const phaseEvent = tickPhase(match, dt);
    if (phaseEvent === 'toLive') {
      hud.setBuyOpen(false);
      hud.renderBuy(BUY_ITEMS, match.money, match.owned, match.grenades, match.armor);
    }
    if (phaseEvent === 'toBuy') {
      resetPositions();
      hud.hideBanner();
      hud.setBuyOpen(true);
      hud.renderBuy(BUY_ITEMS, match.money, match.owned, match.grenades, match.armor);
    }
    if (phaseEvent === 'toMatchEnd') {
      const w = match.matchWinner;
      hud.showMatch(
        w === 'NEON' ? 'NEON TAKES SECTOR 7' : w === 'VOID' ? 'VOID HOLDS SECTOR 7' : 'DRAW — SECTOR 7 STANDS',
        `Final score NEON ${match.scoreNeon} — ${match.scoreVoid} VOID · press Enter or Play again`,
      );
    }
    if (phaseEvent === 'timeout' && match.phase === 'live') {
      finishRound('VOID', 'Time expired — the bomb was never planted');
    }
    if (match.phase !== 'live' && match.phase !== 'buy') {
      updateEffects(fx, dt);
      return;
    }

    // Look.
    const [ldx, ldy] = input.consumeLook();
    player.yaw -= ldx * 0.0022;
    player.pitch -= ldy * 0.0022;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));

    // Movement wish direction, rotated by yaw.
    const k = input.keys;
    const slow = k.has('ShiftLeft') || k.has('ShiftRight');
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    let mx = -sin * fwd + cos * strafe;
    let mz = -cos * fwd - sin * strafe;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      mx /= ml;
      mz /= ml;
      if (slow) {
        mx *= 0.55;
        mz *= 0.55;
      }
    }
    const crouch = k.has('ControlLeft') || k.has('KeyC');
    const speed = stepPlayer(player, { x: mx, z: mz }, crouch, dt);
    void speed;

    // Firing (live rounds only; the overlay and the buy phase block the trigger).
    const w = g.currentWeapon();
    const canFire = match.phase === 'live' && player.alive && (input.locked || g.staged);
    if (canFire && input.firing) {
      const result = tryFire(w, true, dt);
      if (result === 'fire') {
        g.stats.shotsFired += 1;
        const spread = currentSpread(w, Math.hypot(player.vx, player.vz), player.airborne, player.crouched);
        forwardOf(player.yaw + player.recoilYaw, player.pitch + player.recoilPitch, tmpDir);
        // Apply the spread cone: jitter along the right and up axes, then normalise.
        const rx = (Math.random() - 0.5) * 2 * spread;
        const ry = (Math.random() - 0.5) * 2 * spread;
        const rightX = Math.cos(player.yaw);
        const rightZ = -Math.sin(player.yaw);
        tmpDir.x += rx * rightX;
        tmpDir.y += ry;
        tmpDir.z += rx * rightZ;
        tmpDir.normalize();
        const eye = eyeHeight(player);
        const hit = playerShot(ctx, player.x, eye, player.z, tmpDir.x, tmpDir.y, tmpDir.z, w.def.damage, w.def.headMult);
        const muzzle = g.muzzleWorld();
        const end = hit.kind === 'none'
          ? { x: player.x + tmpDir.x * 60, y: eye + tmpDir.y * 60, z: player.z + tmpDir.z * 60 }
          : { x: hit.x, y: hit.y, z: hit.z };
        spawnTracer(fx, muzzle, end, w.def.tracer);
        spawnMuzzle(fx, muzzle);
        if (hit.kind === 'wall') spawnSparks(fx, end, 0xffd27a);
        player.recoilPitch += recoilKick(w);
        player.recoilYaw += (Math.random() - 0.5) * w.def.recoil * 0.5;
        addTrauma(fx, 0.06);
        g.noise = { x: player.x, z: player.z, radius: 30, at: g.now };
      } else if (result === 'empty') {
        g.reloadWeapon();
      }
    } else {
      tryFire(w, false, dt);
    }

    // Plant / defuse.
    if (match.phase === 'live') {
      const plantResult = updatePlant(bomb, g.holdingPlant || k.has('KeyE'), player.x, player.z, dt);
      if (plantResult === 'planted') {
        g.stats.plants += 1;
        award(match, 300, 'Bomb planted');
        g.feed.push('<b>YOU</b> planted the flux bomb');
        hud.killfeed(g.feed);
        g.noise = { x: player.x, z: player.z, radius: 30, at: g.now };
      }
      const fuseResult = updateFuse(bomb, dt);
      if (fuseResult === 'exploded') {
        g.stats.explosions += 1;
        spawnExplosion(fx, { x: bomb.x, y: 0.6, z: bomb.z });
        finishRound('NEON', `Bomb detonated at SITE ${bomb.site}`);
      }
      if (bomb.defused) {
        g.stats.defuses += 1;
        finishRound('VOID', `Bomb defused at SITE ${bomb.site}`);
      }
    }

    // Bots.
    for (const bot of bots) updateBot(bot, dt, ctx, g.now);

    // Grenades.
    stepGrenades(grenades, dt, ctx);

    // Round-end checks.
    if (match.phase === 'live') {
      if (bots.every((b) => !b.alive)) finishRound('NEON', 'VOID squad eliminated');
      else if (!player.alive) finishRound('VOID', 'NEON eliminated — VOID holds the sites');
    }

    updateEffects(fx, dt);
  };

  function finishRound(winner, reason) {
    if (match.phase !== 'live') return;
    endRound(match, winner, reason);
    hud.showBanner(
      winner === 'NEON' ? 'ROUND WON' : 'ROUND LOST',
      `${reason} — NEON ${match.scoreNeon} : ${match.scoreVoid} VOID`,
      winner === 'NEON' ? '#22e6ff' : '#ff2e88',
    );
    g.holdingPlant = false;
  }
  g.finishRound = finishRound;

  // --- Render -------------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let frames = 0;
  const hs = g.hudState;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      g.stepFixed(STEP);
      acc -= STEP;
      steps += 1;
    }
    if (steps === 5) acc = 0;

    // Camera follows the player; recoil and shake ride on top.
    shakeOffset(fx, tmpShake);
    camera.position.set(player.x, eyeHeight(player), player.z);
    camera.rotation.y = player.yaw + player.recoilYaw + tmpShake[1];
    camera.rotation.x = player.pitch + player.recoilPitch + tmpShake[0];
    camera.rotation.z = 0;

    // Viewmodel bob and kick.
    const t = now / 1000;
    const moving = Math.hypot(player.vx, player.vz);
    viewmodel.position.set(
      0.3 + Math.sin(t * 9) * 0.006 * Math.min(1, moving / 5),
      -0.29 + Math.abs(Math.sin(t * 9)) * 0.008 * Math.min(1, moving / 5) + player.recoilPitch * 1.2,
      -0.62 + player.recoilPitch * 0.9,
    );
    viewmodel.visible = player.alive && match.phase !== 'menu';

    // A staged firefight keeps firing: a fresh tracer, sparks and hitmarker
    // every few frames, so the screenshot always catches the fight mid-burst.
    if (g.stagedShot === 'play' && frames % 6 === 0 && bots[0].alive) {
      const b0 = bots[0];
      const muzzle = g.muzzleWorld();
      spawnTracer(fx, muzzle, { x: b0.x, y: 1.35, z: b0.z }, 0xffb020);
      spawnSparks(fx, { x: b0.x, y: 1.35, z: b0.z }, 0xffd27a);
      hud.hitmarker(false);
    }

    // HUD state, mutated in place.
    const w = g.currentWeapon();
    hs.health = player.health;
    hs.armor = player.armor;
    hs.mag = w.mag;
    hs.reserve = w.reserve;
    hs.weaponName = w.reloading ? `${w.def.name} — RELOADING` : w.def.name;
    hs.grenades = match.grenades;
    hs.timeLeft = match.phaseTime;
    hs.round = match.round;
    hs.scoreNeon = match.scoreNeon;
    hs.scoreVoid = match.scoreVoid;
    hs.money = match.money;
    hs.spread = currentSpread(w, Math.hypot(player.vx, player.vz), player.airborne, player.crouched);
    hs.plantProgress = bomb.planting ? bomb.plantProgress : g.defuseProgress || 0;
    hs.planting = bomb.planting;
    hs.plantSite = bomb.site || 'A';
    hs.bombPlanted = bomb.planted && !bomb.exploded && !bomb.defused;
    hs.fuseLeft = bomb.fuseLeft;
    hs.hint = hintText();
    hud.update(hs);

    renderer.render(scene, camera);
    frames += 1;
    if (frames === 3) g.ready = true;
    if (frames % 240 === 0) window.__shotReady = g.ready;
  }

  function hintText() {
    if (match.phase === 'buy') return 'BUY PHASE — press B for the armoury, 1/2/3 to switch weapon';
    if (match.phase === 'menu') return '';
    if (!player.alive) return 'YOU ARE DOWN — the round will reset';
    if (bomb.planted && !bomb.exploded && !bomb.defused) return `BOMB LIVE — SITE ${bomb.site} — defend it, NEON`;
    if (bomb.carried) {
      const site = SITES.A;
      const dA = Math.hypot(player.x - SITES.A.x, player.z - SITES.A.z);
      const dB = Math.hypot(player.x - SITES.B.x, player.z - SITES.B.z);
      if (dA < SITES.A.r || dB < SITES.B.r) return `HOLD E TO PLANT THE FLUX BOMB — SITE ${dA < dB ? 'A' : 'B'}`;
      void site;
    }
    return '';
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Debug handles for the sim test and the screenshot harness.
  window.__NB = g;
  window.__mapDebug = { NODES, EDGES, ROUTES, colliders: COLLIDERS };
  window.__shotReady = false;

  // Staged scene? Serve it instead of the menu.
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '7');
  if (shot) {
    g.staged = true;
    g.stagedShot = shot;
    input.testLook(0, 0);
    applyShot(g, shot, seed);
    if (shot === 'sim') {
      window.__shotReady = false;
    } else {
      // Let two frames render, then declare the shot ready.
      const wait = () => {
        if (frames >= 2) window.__shotReady = true;
        else setTimeout(wait, 50);
      };
      wait();
    }
  }

  requestAnimationFrame(frame);
  return g;
}

createGame();
