// Neon Breach — the bomb. The player carries it, plants it inside a site by
// holding E, and the fuse runs 40 seconds. A VOID bot that reaches the bomb
// defuses it in 5 seconds. Detonation wins the round for NEON; a defuse, a
// timeout or an elimination wins it for VOID.
import { SITES } from './map.js';

export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 40;

export function makeBomb() {
  return {
    carried: true, // with the player until planted
    planting: false,
    plantProgress: 0,
    site: null, // 'A' | 'B' once planted
    x: 0,
    z: 0,
    planted: false,
    fuseLeft: 0,
    defused: false,
    exploded: false,
    beepTimer: 0,
  };
}

// Which site is the player standing in, if any?
export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz < s.r * s.r) return key;
  }
  return null;
}

// Hold-to-plant. Call every fixed step while E is held; returns 'planted'
// on the step the plant completes, 'planting' while in progress, null else.
export function updatePlant(bomb, holding, x, z, dt) {
  if (bomb.planted || bomb.exploded || bomb.defused) return null;
  const site = siteAt(x, z);
  if (!holding || !site) {
    bomb.planting = false;
    bomb.plantProgress = 0;
    return null;
  }
  bomb.planting = true;
  bomb.site = site;
  bomb.x = x;
  bomb.z = z;
  bomb.plantProgress += dt / PLANT_TIME;
  if (bomb.plantProgress >= 1) {
    bomb.planted = true;
    bomb.carried = false;
    bomb.fuseLeft = FUSE_TIME;
    bomb.plantProgress = 1;
    return 'planted';
  }
  return 'planting';
}

// Fuse countdown once planted. Returns 'exploded' on the detonation step.
export function updateFuse(bomb, dt) {
  if (!bomb.planted || bomb.defused || bomb.exploded) return null;
  bomb.fuseLeft -= dt;
  bomb.beepTimer -= dt;
  if (bomb.fuseLeft <= 0) {
    bomb.exploded = true;
    return 'exploded';
  }
  return null;
}

export function resetBomb(bomb) {
  bomb.carried = true;
  bomb.planting = false;
  bomb.plantProgress = 0;
  bomb.site = null;
  bomb.planted = false;
  bomb.fuseLeft = 0;
  bomb.defused = false;
  bomb.exploded = false;
  bomb.beepTimer = 0;
}
