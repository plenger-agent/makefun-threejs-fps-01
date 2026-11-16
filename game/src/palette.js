// Neon Breach — palette and naming. One chosen palette for the whole game:
// deep indigo night, hot cyan for the attackers (NEON), hot magenta for the
// defenders (VOID), amber for money and the bomb. Every colour in the game
// comes from this file so the scene reads at a glance.
export const PALETTE = {
  sky: 0x07060f,
  fog: 0x0a0918,
  floor: 0x181530,
  floorLine: 0x2a2650,
  wall: 0x2b2848,
  wallTop: 0x3d3866,
  crate: 0x241f3d,
  crateEdge: 0x4a4278,
  neonCyan: 0x22e6ff,
  neonMagenta: 0xff2e88,
  neonAmber: 0xffb020,
  neonGreen: 0x39ff88,
  neonViolet: 0x8a5cff,
  ink: 0xeaf6ff,
  muted: 0x8f93b8,
  danger: 0xff3b30,
  siteA: 0x22e6ff,
  siteB: 0xff2e88,
};

// CSS twins of the same colours, used by the HUD.
export const CSS = {
  cyan: '#22e6ff',
  magenta: '#ff2e88',
  amber: '#ffb020',
  green: '#39ff88',
  violet: '#8a5cff',
  ink: '#eaf6ff',
  muted: '#8f93b8',
  danger: '#ff3b30',
};

export const TEAM = { NEON: 'NEON', VOID: 'VOID' };
export const SITE_NAMES = { A: 'SITE A // HELIX', B: 'SITE B // VOLT' };
export const MAP_NAME = 'SECTOR 7 — NEON BREACH';
