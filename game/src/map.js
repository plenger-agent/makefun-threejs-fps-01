// Neon Breach map: SECTOR 7. An original two-site bomb map, drawn for this game.
// Axes: +x east, +z south, y up. Attackers (NEON, the player) spawn south and
// push north through mid or the side lanes; defenders (VOID bots) spawn north
// and hold the two sites. All sizes are metres; the arena is 64 x 44.
import { PALETTE } from './palette.js';

// Every solid in the map: an axis-aligned box. Walls are h=4, crates h=1.2
// (waist cover, shootable over while crouched behind) or h=2.4 (full cover).
// kind is 'wall' | 'crate' | 'pillar' and drives the visuals in world.js.
export const COLLIDERS = [
  // Perimeter.
  { cx: 0, cz: -22.5, w: 66, d: 1, h: 4, kind: 'wall' },
  { cx: 0, cz: 22.5, w: 66, d: 1, h: 4, kind: 'wall' },
  { cx: -32.5, cz: 0, w: 1, d: 46, h: 4, kind: 'wall' },
  { cx: 32.5, cz: 0, w: 1, d: 46, h: 4, kind: 'wall' },
  // West lane divider (door gap z -9..0) and its east mirror.
  { cx: -14, cz: -14, w: 1, d: 10, h: 4, kind: 'wall' },
  { cx: -14, cz: 6, w: 1, d: 12, h: 4, kind: 'wall' },
  { cx: 14, cz: -14, w: 1, d: 10, h: 4, kind: 'wall' },
  { cx: 14, cz: 6, w: 1, d: 12, h: 4, kind: 'wall' },
  // North cross wall: the mid choke is the centre gap x -13..13, and a
  // 4-metre west door (x -17..-13) and east door (x 13..17) let the side
  // lanes cross it too.
  { cx: -24, cz: -6, w: 14, d: 1, h: 4, kind: 'wall' },
  { cx: 24, cz: -6, w: 14, d: 1, h: 4, kind: 'wall' },
  // Connector between the sites, north of the choke: two stubs with a
  // centre doorway so the defender spawn road runs straight down mid.
  { cx: -7.5, cz: -16, w: 5, d: 1, h: 4, kind: 'wall' },
  { cx: 7.5, cz: -16, w: 5, d: 1, h: 4, kind: 'wall' },
  // Attacker-spawn cover walls.
  { cx: -8, cz: 14, w: 6, d: 1, h: 4, kind: 'wall' },
  { cx: 8, cz: 14, w: 6, d: 1, h: 4, kind: 'wall' },
  // Site back walls (low, so the sites read as open yards).
  { cx: -28, cz: -12, w: 1, d: 8, h: 2.4, kind: 'wall' },
  { cx: 28, cz: -12, w: 1, d: 8, h: 2.4, kind: 'wall' },
  // Central mid block: the big sightline breaker of the plaza.
  { cx: 0, cz: 0, w: 4, d: 4, h: 2.4, kind: 'pillar' },
  // Crates: cover scattered on the lanes and inside the sites. Each one sits
  // clear of the bot waypoint edges (checked by sim_test.py).
  { cx: -7, cz: 3.5, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { cx: 7, cz: -3.5, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { cx: -24.5, cz: -15, w: 3, d: 2, h: 1.2, kind: 'crate' },
  { cx: -20, cz: -6, w: 2, d: 2, h: 2.4, kind: 'crate' },
  { cx: 24.5, cz: -15, w: 3, d: 2, h: 1.2, kind: 'crate' },
  { cx: 20, cz: -6, w: 2, d: 2, h: 2.4, kind: 'crate' },
  { cx: -23, cz: 4, w: 2, d: 3, h: 1.2, kind: 'crate' },
  { cx: 23, cz: 4, w: 2, d: 3, h: 1.2, kind: 'crate' },
  { cx: -8, cz: -9.5, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { cx: 8, cz: -9.5, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { cx: -24, cz: 10, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { cx: 24, cz: 10, w: 2, d: 2, h: 1.2, kind: 'crate' },
];

// Bomb sites: plant anywhere inside the circle.
export const SITES = {
  A: { x: -22, z: -12, r: 5.5, color: PALETTE.siteA, name: 'A' },
  B: { x: 22, z: -12, r: 5.5, color: PALETTE.siteB, name: 'B' },
};

export const SPAWNS = {
  // [x, z, yaw] — yaw 0 faces -z (north). Attackers face north, defenders south.
  attacker: [
    [0, 18.5, 0],
    [-4, 18.5, 0],
    [4, 18.5, 0],
  ],
  defender: [
    [0, -18.5, Math.PI],
    [-4, -18.5, Math.PI],
    [4, -18.5, Math.PI],
    [-8, -18.5, Math.PI],
  ],
};

// Bot waypoint graph: NODES are [x, z]; EDGES are bidirectional links.
// The plaza is threaded around the central block (nodes 19/21 cut west and
// east of it); the side lanes cross their dividers only through the door gaps
// (nodes 22/23) or the north corridor (nodes 24/25). Every edge and route was
// checked clear of colliders by sim_test.py.
export const NODES = [
  [0, -18.5], // 0 defender spawn
  [0, -8], // 1 mid north
  [-3.5, 0.5], // 2 mid plaza west cut
  [0, 10], // 3 mid south
  [0, 18.5], // 4 attacker spawn
  [-20, -10], // 5 A approach
  [-22, -12], // 6 site A
  [-16, -14], // 7 A hold (watches the A door)
  [-20, 4], // 8 A lane mid
  [20, -10], // 9 B approach
  [22, -12], // 10 site B
  [16, -14], // 11 B hold
  [20, 4], // 12 B lane mid
  [-8, 0], // 13 mid west
  [8, 0], // 14 mid east
  [-26, -4], // 15 A west pocket
  [26, -4], // 16 B east pocket
  [-8, -14], // 17 north west
  [8, -14], // 18 north east
  [-3, -3], // 19 mid plaza west cut (north)
  [3, 3], // 20 mid plaza east cut (south)
  [3, -3], // 21 mid plaza east cut (north)
  [-14, -4.5], // 22 west door gap
  [14, -4.5], // 23 east door gap
  [-20, -20.5], // 24 north-west corridor
  [20, -20.5], // 25 north-east corridor
];

export const EDGES = [
  [0, 1], [0, 24], [0, 25],
  [1, 19], [1, 21], [1, 17], [1, 18],
  [19, 2], [21, 20], [2, 3], [20, 3], [3, 4],
  [17, 18],
  [24, 5], [25, 9], [24, 6], [25, 10],
  [5, 6], [5, 22], [5, 7],
  [6, 7],
  [9, 10], [9, 23], [9, 11],
  [10, 11],
  [15, 22], [22, 13], [22, 8], [15, 8],
  [16, 23], [23, 14], [23, 12], [16, 12],
  [2, 13], [20, 14], [19, 13], [21, 14],
];

// Named defender plans. A bot takes one plan per round: walk its route, then
// hold the last node and watch the angle its yaw gives.
export const ROUTES = {
  holdA: { nodes: [0, 24, 5, 7], holdYaw: Math.PI }, // north corridor to A, watches south down the A door
  holdB: { nodes: [0, 25, 9, 11], holdYaw: Math.PI },
  holdMid: { nodes: [0, 1, 19], holdYaw: Math.PI }, // watches the mid choke (south)
  retakeA: { nodes: [0, 24, 5, 6], holdYaw: Math.PI * 0.75 },
  retakeB: { nodes: [0, 25, 9, 10], holdYaw: -Math.PI * 0.75 },
  patrol: { nodes: [0, 1, 17, 18, 1, 19, 2, 3, 4], holdYaw: Math.PI },
};

export const ARENA = { minX: -32, maxX: 32, minZ: -22, maxZ: 22 };

// Point-in-solid test for a circle of radius r at (x, z). Used by movement,
// bot pathing and the sim self-test.
export function hitsSolid(x, z, r) {
  if (x < ARENA.minX + r || x > ARENA.maxX - r || z < ARENA.minZ + r || z > ARENA.maxZ - r) return true;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    if (Math.abs(x - c.cx) < c.w / 2 + r && Math.abs(z - c.cz) < c.d / 2 + r) return true;
  }
  return false;
}

// Resolve a circle of radius r at (x, z) out of solids, axis by axis.
// Mutates and returns the same [x, z] array: no allocation in the hot path.
export function resolveCircle(p, r) {
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    const hx = c.w / 2 + r;
    const hz = c.d / 2 + r;
    const dx = p[0] - c.cx;
    const dz = p[1] - c.cz;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      const px = hx - Math.abs(dx);
      const pz = hz - Math.abs(dz);
      if (px < pz) p[0] = c.cx + (dx > 0 ? hx : -hx);
      else p[1] = c.cz + (dz > 0 ? hz : -hz);
    }
  }
  if (p[0] < ARENA.minX + r) p[0] = ARENA.minX + r;
  if (p[0] > ARENA.maxX - r) p[0] = ARENA.maxX - r;
  if (p[1] < ARENA.minZ + r) p[1] = ARENA.minZ + r;
  if (p[1] > ARENA.maxZ - r) p[1] = ARENA.maxZ - r;
  return p;
}

// Breadth-first route between two waypoint nodes. Runs only when a bot is
// given a new destination, never per frame.
export const ADJ = (() => {
  const adj = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
})();

export function findRoute(from, to) {
  if (from === to) return [from];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const n = queue.shift();
    for (const m of ADJ[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === to) {
          const path = [to];
          let cur = to;
          while (cur !== from) {
            cur = prev[cur];
            path.unshift(cur);
          }
          return path;
        }
        queue.push(m);
      }
    }
  }
  return [from];
}
