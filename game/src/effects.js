// Neon Breach — effects. Tracers, impact sparks, muzzle flash, explosions
// and camera shake. Everything is pooled at startup and reused: the hot
// loops create no objects, they only move numbers that already exist.
import * as THREE from 'three';

const TRACER_POOL = 28;
const SPARK_POOL = 14;
const SPARK_POINTS = 16;

export function makeEffects(scene, flashLight) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0, maxLife: 0.14 });
  }

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(SPARK_POINTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffd27a, size: 0.14, transparent: true, opacity: 0 });
    const points = new THREE.Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, vel: new Float32Array(SPARK_POINTS * 3), life: 0 });
  }

  const blastGeo = new THREE.SphereGeometry(1, 20, 14);
  const blastMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0, depthWrite: false });
  const blast = new THREE.Mesh(blastGeo, blastMat);
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff9a2e, 0, 26, 1.6);
  scene.add(blastLight);

  return {
    tracers, sparks, blast, blastLight, blastLife: 0, flashLight,
    trauma: 0, // camera shake, 0..1
    flashLeft: 0,
  };
}

export function spawnTracer(fx, from, to, color) {
  for (const t of fx.tracers) {
    if (t.life <= 0) {
      const p = t.line.geometry.attributes.position.array;
      p[0] = from.x; p[1] = from.y; p[2] = from.z;
      p[3] = to.x; p[4] = to.y; p[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(color);
      t.line.material.opacity = 0.95;
      t.line.visible = true;
      t.life = t.maxLife;
      return;
    }
  }
}

export function spawnSparks(fx, at, color) {
  for (const s of fx.sparks) {
    if (s.life <= 0) {
      const p = s.points.geometry.attributes.position.array;
      for (let i = 0; i < SPARK_POINTS; i++) {
        p[i * 3] = at.x;
        p[i * 3 + 1] = at.y;
        p[i * 3 + 2] = at.z;
        const a = Math.random() * Math.PI * 2;
        const b = (Math.random() - 0.5) * Math.PI;
        const sp = 2 + Math.random() * 4;
        s.vel[i * 3] = Math.cos(a) * Math.cos(b) * sp;
        s.vel[i * 3 + 1] = Math.sin(b) * sp + 1.5;
        s.vel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
      }
      s.points.geometry.attributes.position.needsUpdate = true;
      s.points.material.color.setHex(color);
      s.points.material.opacity = 1;
      s.points.visible = true;
      s.life = 0.4;
      return;
    }
  }
}

export function spawnExplosion(fx, at) {
  fx.blast.position.set(at.x, Math.max(0.6, at.y), at.z);
  fx.blast.scale.setScalar(0.4);
  fx.blast.visible = true;
  fx.blast.material.opacity = 0.9;
  fx.blastLight.position.set(at.x, at.y + 1, at.z);
  fx.blastLight.intensity = 260;
  fx.blastLife = 0.55;
  fx.trauma = Math.min(1, fx.trauma + 0.7);
  spawnSparks(fx, at, 0xffb020);
  spawnSparks(fx, at, 0xff5a2e);
}

export function spawnMuzzle(fx, at) {
  fx.flashLight.position.set(at.x, at.y, at.z);
  fx.flashLight.intensity = 55;
  fx.flashLeft = 0.06;
}

export function addTrauma(fx, amount) {
  fx.trauma = Math.min(1, fx.trauma + amount);
}

export function updateEffects(fx, dt) {
  for (const t of fx.tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, (t.life / t.maxLife)) * 0.95;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  for (const s of fx.sparks) {
    if (s.life > 0) {
      s.life -= dt;
      const p = s.points.geometry.attributes.position.array;
      for (let i = 0; i < SPARK_POINTS; i++) {
        s.vel[i * 3 + 1] -= 9 * dt;
        p[i * 3] += s.vel[i * 3] * dt;
        p[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
        p[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
        if (p[i * 3 + 1] < 0.03) p[i * 3 + 1] = 0.03;
      }
      s.points.geometry.attributes.position.needsUpdate = true;
      s.points.material.opacity = Math.max(0, s.life / 0.4);
      if (s.life <= 0) s.points.visible = false;
    }
  }
  if (fx.blastLife > 0) {
    fx.blastLife -= dt;
    const k = 1 - fx.blastLife / 0.55;
    fx.blast.scale.setScalar(0.4 + k * 6.5);
    fx.blast.material.opacity = Math.max(0, 0.9 * (1 - k));
    fx.blastLight.intensity = Math.max(0, 260 * (1 - k));
    if (fx.blastLife <= 0) {
      fx.blast.visible = false;
      fx.blastLight.intensity = 0;
    }
  }
  if (fx.flashLeft > 0) {
    fx.flashLeft -= dt;
    if (fx.flashLeft <= 0) fx.flashLight.intensity = 0;
  }
  fx.trauma = Math.max(0, fx.trauma - dt * 1.6);
}

// Shake offset for the camera this frame (radians of extra pitch/yaw).
export function shakeOffset(fx, out) {
  const s = fx.trauma * fx.trauma;
  out[0] = (Math.random() - 0.5) * 0.05 * s;
  out[1] = (Math.random() - 0.5) * 0.05 * s;
  return out;
}
