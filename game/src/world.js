// Neon Breach — world building. Turns map.js data into the three.js scene:
// floor, walls, crates, neon strips, site beacons, sky. Everything is
// procedural geometry in the chosen palette; there are no external assets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { COLLIDERS, SITES, ARENA } from './map.js';

const tmpOrigin = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
raycaster.far = 200;

// One material per colour/finish, shared by every mesh that uses it.
function makeMaterials() {
  return {
    floor: new THREE.MeshBasicMaterial({ color: PALETTE.floor }),
    floorLine: new THREE.MeshBasicMaterial({ color: PALETTE.floorLine }),
    wall: new THREE.MeshLambertMaterial({ color: PALETTE.wall }),
    wallTop: new THREE.MeshBasicMaterial({ color: PALETTE.wallTop }),
    crate: new THREE.MeshLambertMaterial({ color: PALETTE.crate }),
    crateEdge: new THREE.MeshBasicMaterial({ color: PALETTE.crateEdge }),
    cyan: new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan }),
    magenta: new THREE.MeshBasicMaterial({ color: PALETTE.neonMagenta }),
    amber: new THREE.MeshBasicMaterial({ color: PALETTE.neonAmber }),
    violet: new THREE.MeshBasicMaterial({ color: PALETTE.neonViolet }),
    green: new THREE.MeshBasicMaterial({ color: PALETTE.neonGreen }),
    siteA: new THREE.MeshBasicMaterial({
      color: PALETTE.siteA, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    }),
    siteB: new THREE.MeshBasicMaterial({
      color: PALETTE.siteB, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    }),
  };
}

function letterSprite(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillStyle = color;
  g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 3.2, 1);
  return sprite;
}

export function buildWorld(scene) {
  const mats = makeMaterials();
  const solids = []; // meshes that block sight and shots
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);

  scene.add(new THREE.AmbientLight(0x8a90c0, 1.15));
  const hemi = new THREE.HemisphereLight(0x4a4a8a, 0x0a0918, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xbfd4ff, 1.25);
  sun.position.set(18, 30, 12);
  scene.add(sun);
  const midGlow = new THREE.PointLight(PALETTE.neonCyan, 60, 30, 1.8);
  midGlow.position.set(0, 6, 0);
  scene.add(midGlow);
  const aGlow = new THREE.PointLight(PALETTE.siteA, 40, 22, 1.8);
  aGlow.position.set(SITES.A.x, 5, SITES.A.z);
  scene.add(aGlow);
  const bGlow = new THREE.PointLight(PALETTE.siteB, 40, 22, 1.8);
  bGlow.position.set(SITES.B.x, 5, SITES.B.z);
  scene.add(bGlow);

  // Floor: one dark slab plus a pale grid of thin strips so lanes read.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(66, 0.2, 46), mats.floor);
  floor.position.set(0, -0.1, 0);
  root.add(floor);
  const grid = new THREE.GridHelper(64, 32, PALETTE.floorLine, PALETTE.floorLine);
  grid.position.y = 0.01;
  root.add(grid);

  // Neon lane guides on the floor: cyan to A, magenta to B, violet down mid.
  function floorStrip(x, z, w, d, mat) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat);
    s.position.set(x, 0.03, z);
    root.add(s);
  }
  floorStrip(-22, -4, 0.35, 16, mats.cyan); // west lane
  floorStrip(22, -4, 0.35, 16, mats.magenta); // east lane
  floorStrip(0, 8, 0.35, 18, mats.violet); // mid
  floorStrip(0, -16, 30, 0.35, mats.violet); // north connector

  // Solids from the map: walls, crates and the central pillar.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const c of COLLIDERS) {
    const mat = c.kind === 'crate' ? mats.crate : mats.wall;
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(c.w, c.h, c.d);
    mesh.position.set(c.cx, c.h / 2, c.cz);
    mesh.userData.collider = c;
    root.add(mesh);
    solids.push(mesh);
    // A bright cap on every solid so its silhouette reads in the dark.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(c.w + 0.06, 0.08, c.d + 0.06),
      c.kind === 'crate' ? mats.crateEdge : mats.wallTop,
    );
    cap.position.set(c.cx, c.h + 0.04, c.cz);
    root.add(cap);
    // Neon edge on the tall pillar and the site crates.
    if (c.kind === 'pillar' || (c.kind === 'crate' && c.h > 2)) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.18, c.h, 0.18), mats.cyan);
      edge.position.set(c.cx + c.w / 2 - 0.1, c.h / 2, c.cz + c.d / 2 - 0.1);
      root.add(edge);
    }
  }

  // Bomb sites: a glowing floor ring, a translucent volume and a floating letter.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const mat = key === 'A' ? mats.siteA : mats.siteB;
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.35, site.r, 48), new THREE.MeshBasicMaterial({
      color: site.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.05, site.z);
    root.add(ring);
    const volume = new THREE.Mesh(new THREE.CylinderGeometry(site.r, site.r, 3.4, 32, 1, true), mat);
    volume.position.set(site.x, 1.7, site.z);
    root.add(volume);
    const letter = letterSprite(key, key === 'A' ? '#22e6ff' : '#ff2e88');
    letter.position.set(site.x, 4.3, site.z);
    root.add(letter);
  }

  // Stars above the arena: cheap points, no texture needed.
  const starCount = 260;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 220;
    starPos[i * 3 + 1] = 14 + Math.random() * 50;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 220;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaac4ff, size: 0.55 }));
  root.add(stars);

  // Muzzle-flash light, reused by every shot (moved, never recreated).
  const flash = new THREE.PointLight(0xffc46b, 0, 9, 1.6);
  scene.add(flash);

  return { root, solids, flash };
}

// True when a straight segment between two points is blocked by any solid.
// Used for bot vision and for deciding whether a shot can reach its target.
export function losBlocked(solids, ax, ay, az, bx, by, bz) {
  tmpOrigin.set(ax, ay, az);
  tmpDir.set(bx - ax, by - ay, bz - az);
  const dist = tmpDir.length();
  if (dist < 0.001) return false;
  tmpDir.multiplyScalar(1 / dist);
  raycaster.set(tmpOrigin, tmpDir);
  raycaster.far = dist;
  return raycaster.intersectObjects(solids, false).length > 0;
}

// A simple humanoid: dark body, glowing visor, team-coloured shoulder bars.
// The head mesh is returned separately so headshots can be tested against it.
export function makeBotMesh(teamColor) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2c2750 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1936 });
  const teamMat = new THREE.MeshBasicMaterial({ color: teamColor });
  const visorMat = new THREE.MeshBasicMaterial({ color: teamColor });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.3), darkMat);
  legs.position.y = 0.4;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), bodyMat);
  torso.position.y = 1.16;
  group.add(torso);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, 0.38), teamMat);
  bar.position.y = 1.44;
  group.add(bar);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.4), bodyMat);
  head.position.y = 1.72;
  head.name = 'head';
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.06), visorMat);
  visor.position.set(0, 1.74, 0.21);
  group.add(visor);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), darkMat);
  gun.position.set(0.28, 1.28, 0.42);
  group.add(gun);
  // A thin team-coloured ring on the floor so the bot reads at distance.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);
  group.userData.head = head;
  return group;
}

// The player's own viewmodel: a compact neon rifle that bobs and kicks.
export function makeViewmodel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x17152a });
  const cyan = new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan });
  const amber = new THREE.MeshBasicMaterial({ color: PALETTE.neonAmber });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), dark);
  group.add(body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
  barrel.position.set(0, 0.03, -0.46);
  group.add(barrel);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.5), cyan);
  strip.position.set(0, 0.075, -0.05);
  group.add(strip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.1), amber);
  sight.position.set(0, 0.1, -0.12);
  group.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.35;
  group.add(grip);
  // Smaller and lower than a real rifle would sit, so it frames the aim
  // instead of eating the bottom-right of the screen.
  group.scale.setScalar(0.72);
  group.position.set(0.3, -0.29, -0.62);
  return group;
}

export { ARENA };
