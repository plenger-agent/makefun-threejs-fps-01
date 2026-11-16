// Neon Breach — the player. Acceleration-based movement with friction, a
// crouch that shrinks the hitbox and steadies aim, AABB collision against the
// map, and health + armour. All motion is integrated in the fixed step.
import { resolveCircle } from './map.js';

export const PLAYER = {
  radius: 0.42,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  heightStand: 1.8,
  heightCrouch: 1.3,
  accel: 42,
  friction: 11,
  maxSpeed: 5.6,
  maxSpeedCrouch: 2.6,
  airControl: 0.35,
};

export function makePlayer(spawn) {
  return {
    x: spawn[0],
    z: spawn[1],
    yaw: spawn[2],
    pitch: 0,
    vx: 0,
    vz: 0,
    crouched: false,
    airborne: false,
    health: 100,
    armor: 0,
    alive: true,
    // Recoil recovery: pitch offset that decays back to zero.
    recoilPitch: 0,
    recoilYaw: 0,
    // Reused scratch so the step allocates nothing.
    _p: [0, 0],
  };
}

export function eyeHeight(p) {
  return p.crouched ? PLAYER.eyeCrouch : PLAYER.eyeStand;
}

export function playerHeight(p) {
  return p.crouched ? PLAYER.heightCrouch : PLAYER.heightStand;
}

// One fixed step of movement. `move` is {x, z} wish direction in world space
// (already rotated by yaw), `wantCrouch` from the input. Returns speed.
export function stepPlayer(p, move, wantCrouch, dt) {
  if (!p.alive) return 0;
  p.crouched = wantCrouch;
  const maxSpeed = p.crouched ? PLAYER.maxSpeedCrouch : PLAYER.maxSpeed;
  const accel = p.airborne ? PLAYER.accel * PLAYER.airControl : PLAYER.accel;
  p.vx += move.x * accel * dt;
  p.vz += move.z * accel * dt;
  // Friction when no wish direction: exponential decay, framerate-independent.
  const damp = Math.exp(-PLAYER.friction * dt);
  if (move.x === 0 && move.z === 0) {
    p.vx *= damp;
    p.vz *= damp;
  }
  const speed = Math.hypot(p.vx, p.vz);
  if (speed > maxSpeed) {
    p.vx *= maxSpeed / speed;
    p.vz *= maxSpeed / speed;
  }
  p._p[0] = p.x + p.vx * dt;
  p._p[1] = p.z + p.vz * dt;
  resolveCircle(p._p, PLAYER.radius);
  p.x = p._p[0];
  p.z = p._p[1];
  // Recoil decays back toward zero.
  p.recoilPitch *= Math.exp(-9 * dt);
  p.recoilYaw *= Math.exp(-9 * dt);
  return Math.hypot(p.vx, p.vz);
}

// Damage with armour: armour absorbs half of each hit until it is gone.
export function damagePlayer(p, amount) {
  if (!p.alive) return 0;
  let left = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, left * 0.5);
    p.armor -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
  }
  return left;
}

export function healPlayer(p, amount) {
  if (!p.alive) return;
  p.health = Math.min(100, p.health + amount);
}

// Forward vector from yaw/pitch (yaw 0 faces -z, north).
export function forwardOf(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}
