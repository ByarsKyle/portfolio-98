// ─────────────────────────────────────────────────────────────
// core/controls — pointer-lock first person with AABB collision,
// footstep-synced head bob and a bit of camera lag so it feels
// like a body walking rather than a camera sliding.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ROOM } from '../assets/room.js';

const EYE = 1.585;
const RADIUS = 0.24;

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.yaw = 0;                // yaw 0 looks down -Z, i.e. at the desk
    this.pitch = -0.04;
    this.pos = new THREE.Vector3(-0.75, EYE, 1.85);
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.locked = false;
    this.enabled = true;
    this.colliders = [];
    this.bob = 0;
    this.bobAmt = 0;
    this.lean = 0;
    this.sensitivity = 0.0021;
    this.onLockChange = null;
    this.onStep = null;
    this._stepPhase = 0;

    this._onMouseMove = (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.35, Math.min(1.28, this.pitch));
    };
    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onLock = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onLock);
  }

  lock() { this.dom.requestPointerLock?.(); }
  unlock() { document.exitPointerLock?.(); }

  /** colliders: {x0,x1,z0,z1,y1} axis-aligned boxes the player can't walk through */
  setColliders(list) { this.colliders = list; }

  _resolve(nx, nz) {
    // room bounds
    const pad = RADIUS + 0.04;
    nx = Math.max(ROOM.x0 + pad, Math.min(ROOM.x1 - pad, nx));
    nz = Math.max(ROOM.z0 + pad, Math.min(ROOM.z1 - pad, nz));

    for (const c of this.colliders) {
      if (c.y0 !== undefined && EYE - 1.2 > c.y1) continue;   // step over low stuff? no — full height block
      const cx = Math.max(c.x0, Math.min(nx, c.x1));
      const cz = Math.max(c.z0, Math.min(nz, c.z1));
      const dx = nx - cx, dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        const d = Math.sqrt(d2);
        if (d > 1e-5) {
          const push = (RADIUS - d) / d;
          nx += dx * push; nz += dz * push;
        } else {
          // centre inside the box: eject along the shallowest axis
          const toL = nx - c.x0, toR = c.x1 - nx, toB = nz - c.z0, toF = c.z1 - nz;
          const m = Math.min(toL, toR, toB, toF);
          if (m === toL) nx = c.x0 - RADIUS;
          else if (m === toR) nx = c.x1 + RADIUS;
          else if (m === toB) nz = c.z0 - RADIUS;
          else nz = c.z1 + RADIUS;
        }
      }
    }
    return [nx, nz];
  }

  update(dt) {
    // while a cinematic owns the camera we keep our hands off it
    if (!this.enabled) { this.vel.set(0, 0, 0); this.bobAmt = 0; return; }
    const k = this.keys;
    let ix = 0, iz = 0;
    if (this.enabled && this.locked) {
      if (k.has('KeyW') || k.has('ArrowUp')) iz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iz -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    }
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }

    const speed = run ? 2.35 : 1.32;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is -Z in camera space
    const wantX = (-sin * iz + cos * ix) * speed;
    const wantZ = (-cos * iz - sin * ix) * speed;

    const accel = len > 0 ? 11 : 14;
    this.vel.x += (wantX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wantZ - this.vel.z) * Math.min(1, accel * dt);

    const [nx, nz] = this._resolve(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt);
    this.pos.x = nx; this.pos.z = nz;

    // head bob tied to actual ground speed
    const gs = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmt += (Math.min(1, gs / speed) - this.bobAmt) * Math.min(1, 8 * dt);
    const bobRate = run ? 10.4 : 7.4;
    if (gs > 0.05) {
      const prev = this._stepPhase;
      this._stepPhase += gs * dt * (run ? 2.15 : 1.75);
      if (Math.floor(prev * 2) !== Math.floor(this._stepPhase * 2)) this.onStep?.(run);
      this.bob += dt * bobRate;
    }
    const bobY = Math.sin(this.bob * 2) * 0.016 * this.bobAmt;
    const bobX = Math.cos(this.bob) * 0.014 * this.bobAmt;
    // strafe lean
    const targetLean = -ix * 0.022;
    this.lean += (targetLean - this.lean) * Math.min(1, 6 * dt);

    this.camera.position.set(this.pos.x + bobX * cos, EYE + bobY, this.pos.z - bobX * sin);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch + Math.sin(this.bob * 2 + 1.2) * 0.0035 * this.bobAmt);
    this.camera.rotateZ(this.lean);
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onLock);
  }
}
