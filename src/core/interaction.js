// ─────────────────────────────────────────────────────────────
// core/interaction — the E prompt, and the camera moves that go
// with each thing you can use.
//
// Sitting down at the computer is not an overlay: the camera
// physically dollies to 25 cm from the tube until the screen fills
// the frame. What you read is the same curved, scanlined, glowing
// mesh you were looking at from across the room.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { DESK } from '../assets/furniture.js';
import { CRTShader } from '../assets/desktop.js';

const el = (id) => document.getElementById(id);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Interaction {
  constructor({ scene, camera, player, desktop, lights, grade, audio, bloom, pug, props, renderPass, renderer }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.desktop = desktop;
    this.os = desktop.os;
    this.lights = lights;
    this.grade = grade;
    this.audio = audio;
    this.bloom = bloom;
    this.pug = pug;
    this.renderPass = renderPass;
    this.renderer = renderer;

    this.mode = 'walk';           // walk | toCRT | inCRT | fromCRT | toBed | inBed | fromBed
    this.blend = 0;
    this.from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.to = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.target = null;
    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();
    this.screenMesh = desktop.screenObject;
    this.lampOn = true;
    this.roomLightOn = true;
    this._petCooldown = 0;

    this.hud = el('hud');
    this.prompt = el('prompt');
    this.promptLabel = el('prompt-label');
    this.exitHint = el('crt-exit');
    this.fsButton = el('crt-fullscreen');

    this.fullscreen = false;
    this.fs = null;               // built lazily the first time you go fullscreen

    this._buildTargets();
    this._bindInput();
  }

  get inCRT() { return this.mode === 'inCRT' || this.mode === 'toCRT'; }

  // ── fullscreen ─────────────────────────────────────────────
  // Not an overlay either: the same OS canvas goes through the same CRT
  // shader, just on a flat quad with the barrel distortion turned off
  // (uWarp = 0) instead of on the curved tube. The composer is pointed at
  // this stage, so bloom and the film grade still apply.
  _buildFullscreenStage() {
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CRTShader.uniforms),
      vertexShader: CRTShader.vertexShader,
      fragmentShader: CRTShader.fragmentShader,
      toneMapped: true,
    });
    const u = material.uniforms;
    u.uMap.value = this.os.texture;
    u.uWarp.value = 0;          // flat panel, no tube geometry to match
    // At 5x the size the tube artefacts have to come down or 8px Tahoma
    // mushes, and the phosphor glow has to come right down or a white
    // Explorer window sums past 1.0 and blows out.
    u.uScan.value = 0.16;
    u.uGrille.value = 0.10;
    u.uGlow.value = 0.10;
    u.uBright.value = 1.0;
    u.uFlicker.value = 0.006;
    u.uCurve.value = 0.0;

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    const stage = new THREE.Scene();
    stage.background = new THREE.Color(0x000000);
    stage.add(quad);

    const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 10);
    cam.position.z = 1;

    this.fs = { stage, cam, quad, material };
    this._layoutFullscreen();
  }

  /** Letterbox the 4:3 canvas into whatever shape the window happens to be. */
  _layoutFullscreen() {
    if (!this.fs) return;
    const aspect = innerWidth / innerHeight;
    const cam = this.fs.cam;
    cam.left = -aspect / 2; cam.right = aspect / 2;
    cam.top = 0.5; cam.bottom = -0.5;
    cam.updateProjectionMatrix();

    const MARGIN = 0.97;
    let h = MARGIN, w = h * (4 / 3);
    if (w > aspect * MARGIN) { w = aspect * MARGIN; h = w * (3 / 4); }
    this.fs.quad.scale.set(w, h, 1);
  }

  toggleFullscreen(on = !this.fullscreen) {
    if (this.mode !== 'inCRT') return;
    if (on === this.fullscreen) return;
    if (!this.fs) this._buildFullscreenStage();
    this.fullscreen = on;

    if (on) {
      this._layoutFullscreen();
      this._saved = {
        bloom: this.bloom.strength,
        vignette: this.grade.uniforms.uVignette.value,
        aberration: this.grade.uniforms.uAberration.value,
        grain: this.grade.uniforms.uGrain.value,
        toneMapping: this.renderer.toneMapping,
      };
      // The room's look is a filmic grade of a dim bedroom. Applied to a whole
      // screen of white Win98 chrome it eats the contrast and 11px Tahoma stops
      // being readable — ACES in particular turns #ffffff into wet grey. Drop
      // the tone curve entirely while the desktop is the whole frame: the OS
      // canvas is already sRGB, so straight through is exactly right.
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.bloom.strength = 0.05;
      this.grade.uniforms.uVignette.value = 0.34;
      this.grade.uniforms.uAberration.value = 0.0004;
      this.grade.uniforms.uGrain.value = 0.010;
      this.renderPass.scene = this.fs.stage;
      this.renderPass.camera = this.fs.cam;
    } else {
      this.renderPass.scene = this.scene;
      this.renderPass.camera = this.camera;
      if (this._saved) {
        this.renderer.toneMapping = this._saved.toneMapping;
        this.bloom.strength = this._saved.bloom;
        this.grade.uniforms.uVignette.value = this._saved.vignette;
        this.grade.uniforms.uAberration.value = this._saved.aberration;
        this.grade.uniforms.uGrain.value = this._saved.grain;
      }
    }
    this._syncFullscreenUI();
    this.audio.play('click');
  }

  _syncFullscreenUI() {
    const b = this.fsButton;
    if (!b) return;
    const seated = this.mode === 'inCRT';
    b.hidden = !seated;
    if (!seated) return;
    b.classList.toggle('on', this.fullscreen);
    b.querySelector('span').textContent = this.fullscreen ? 'Exit Full Screen' : 'Full Screen';
    if (this.exitHint) {
      this.exitHint.innerHTML = this.fullscreen
        ? 'Press <b>Esc</b> to leave full screen'
        : 'Press <b>Esc</b> to step away from the computer';
    }
  }

  _buildTargets() {
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    this.targets = [
      {
        id: 'crt', label: 'Use the computer', pos: v(DESK.x - 0.30, DESK.h + 0.22, DESK.z - 0.10),
        radius: 1.05, action: () => this._enterCRT(),
      },
      {
        id: 'tower', label: 'Restart the machine', pos: v(DESK.x + 0.60, 0.28, DESK.z + 0.10),
        radius: 0.62, action: () => {
          this.os.restart();
          this.audio.play('crtDegauss');
        },
      },
      {
        id: 'pug', label: 'Say hello', pos: v(-0.30, 0.28, 0.62),
        radius: 0.85, action: () => this._petPug(),
      },
      {
        id: 'lamp', label: 'Toggle the desk lamp', pos: v(1.36, DESK.h + 0.30, DESK.z - 0.20),
        radius: 0.72, action: () => this._toggleLamp(),
      },
      {
        id: 'switch', label: 'Toggle the light', pos: v(-0.72, 1.22, 2.49),
        radius: 0.85, action: () => this._toggleRoomLight(),
      },
      {
        id: 'bed', label: 'Lie down', pos: v(1.65, 0.6, 1.55),
        radius: 1.0, action: () => this._enterBed(),
      },
      {
        id: 'door', label: 'Leave', pos: v(-1.25, 1.0, 2.42),
        radius: 0.9, action: () => this._leave(),
      },
    ];
  }

  _bindInput() {
    this._onKey = (e) => {
      if (e.code === 'KeyE' && !e.repeat) {
        if (this.mode === 'walk' && this.target) {
          this.target.action();
          e.preventDefault();
          return;
        }
        if (this.mode === 'inCRT' || this.mode === 'inBed') { this._exit(); return; }
      }
      // Alt+Enter — the same thing it did to a DOS box in 1998
      if (e.code === 'Enter' && e.altKey && this.mode === 'inCRT') {
        this.toggleFullscreen();
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') {
        // back out one layer at a time: full screen, then the chair
        if (this.fullscreen) { this.toggleFullscreen(false); e.preventDefault(); return; }
        if (this.mode === 'inCRT' || this.mode === 'inBed') { this._exit(); e.preventDefault(); }
        return;
      }
      if (this.mode === 'inCRT') {
        // everything else goes to the machine
        if (['Tab', 'F5', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code)
            || e.key === ' ' || e.key === 'Backspace') e.preventDefault();
        this.audio.resume();
        this.os.key(e);
      }
    };
    document.addEventListener('keydown', this._onKey);

    this._onMove = (e) => {
      if (this.mode !== 'inCRT') return;
      this.pointerNDC.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointerNDC.y = -(e.clientY / innerHeight) * 2 + 1;
      const uv = this._screenUV();
      if (uv) this.os.pointer('move', uv.x, uv.y);
    };
    this._onDown = (e) => {
      if (this.mode !== 'inCRT') return;
      this.audio.resume();
      const uv = this._screenUV();
      if (uv) this.os.pointer('down', uv.x, uv.y, e.button);
      e.preventDefault();
    };
    this._onUp = (e) => {
      if (this.mode !== 'inCRT') return;
      const uv = this._screenUV();
      if (uv) this.os.pointer('up', uv.x, uv.y, e.button);
    };
    this._onWheel = (e) => {
      if (this.mode !== 'inCRT') return;
      const key = e.deltaY > 0 ? 'ArrowDown' : 'ArrowUp';
      for (let i = 0; i < 3; i++) this.os.key({ key, code: key, preventDefault() {} });
      e.preventDefault();
    };
    this._onCtx = (e) => { if (this.mode === 'inCRT') e.preventDefault(); };

    this._onResize = () => this._layoutFullscreen();

    addEventListener('mousemove', this._onMove);
    addEventListener('mousedown', this._onDown);
    addEventListener('mouseup', this._onUp);
    addEventListener('wheel', this._onWheel, { passive: false });
    addEventListener('contextmenu', this._onCtx);
    addEventListener('resize', this._onResize);

    if (this.fsButton) {
      this.fsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.resume();
        this.toggleFullscreen();
      });
      // the button lives over the screen; don't let its clicks reach the OS
      this.fsButton.addEventListener('mousedown', (e) => e.stopPropagation());
      this.fsButton.addEventListener('mouseup', (e) => e.stopPropagation());
    }

    // the OS asks us for sounds
    this.os.state.sound = (name, opts) => this.audio.play(name, opts);
    // and the desktop hands the screen colour to the lighting rig
    this.scene.userData.screenLight = (r, g, b, p) => this.lights.setScreen(r, g, b, p);
  }

  _screenUV() {
    // same routine either way — pick whichever surface is currently showing
    const flat = this.fullscreen && this.fs;
    const cam = flat ? this.fs.cam : this.camera;
    const mesh = flat ? this.fs.quad : this.screenMesh;
    this.raycaster.setFromCamera(this.pointerNDC, cam);
    const hit = this.raycaster.intersectObject(mesh, false)[0];
    if (!hit || !hit.uv) return null;
    return { x: hit.uv.x * 640, y: (1 - hit.uv.y) * 480 };
  }

  // ── transitions ────────────────────────────────────────────
  _beginMove(toPos, toQuat, mode, duration = 1.15) {
    this.from.pos.copy(this.camera.position);
    this.from.quat.copy(this.camera.quaternion);
    this.to.pos.copy(toPos);
    this.to.quat.copy(toQuat);
    this.blend = 0;
    this.duration = duration;
    this.mode = mode;
    this.player.enabled = false;
    this.player.unlock();
    this.prompt.hidden = true;
    this.hud.classList.remove('near');
  }

  _enterCRT() {
    const screen = this.screenMesh;
    screen.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    screen.getWorldPosition(pos);
    screen.getWorldQuaternion(quat);

    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
    // distance at which the 0.245 m tube fills 88% of the viewport height
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = 0.245 / (2 * 0.88 * Math.tan(fov / 2));
    const target = pos.clone().addScaledVector(normal, dist);

    // leave the body seated at the desk so standing up makes sense
    this.player.pos.set(DESK.x - 0.26, this.player.pos.y, DESK.z + 0.74);
    this.player.yaw = 0;
    this.player.pitch = -0.05;
    this.player.vel.set(0, 0, 0);

    this._beginMove(target, quat, 'toCRT', 1.25);
    document.body.style.cursor = 'none';
    this.audio.play('click');
    el('hint')?.classList.add('gone');
  }

  _enterBed() {
    const pos = new THREE.Vector3(1.62, 0.86, 1.30);
    const e = new THREE.Euler(-Math.PI / 2 + 0.28, 0.15, 0, 'YXZ');
    const quat = new THREE.Quaternion().setFromEuler(e);
    this.player.pos.set(1.28, this.player.pos.y, 1.30);
    this.player.yaw = -Math.PI / 2;
    this.player.pitch = 0.1;
    this._beginMove(pos, quat, 'toBed', 1.6);
  }

  _exit() {
    // standing up always drops out of full screen first
    if (this.fullscreen) this.toggleFullscreen(false);
    // return to wherever the body is standing
    const p = this.player;
    const pos = new THREE.Vector3(p.pos.x, 1.585, p.pos.z);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    e.y = p.yaw; e.x = p.pitch;
    q.setFromEuler(e);
    this.from.pos.copy(this.camera.position);
    this.from.quat.copy(this.camera.quaternion);
    this.to.pos.copy(pos);
    this.to.quat.copy(q);
    this.blend = 0;
    this.duration = 0.85;
    this.mode = this.mode === 'inCRT' ? 'fromCRT' : 'fromBed';
    document.body.style.cursor = '';
    this.exitHint?.classList.add('gone');
    this._syncFullscreenUI();
    this.audio.play('click');
  }

  _petPug() {
    if (this._petCooldown > 0) return;
    this._petCooldown = 1.4;
    this.audio.play('bark');
    // he perks up: a quick head lift and a burst of tail
    if (this.pug) this.pug.excite?.(2.2);
  }

  _toggleLamp() {
    this.lampOn = !this.lampOn;
    this.lights.lamp.visible = this.lampOn;
    this.audio.play('lampClick');
  }

  _toggleRoomLight() {
    this.roomLightOn = !this.roomLightOn;
    this.lights.lantern.visible = this.roomLightOn;
    this.audio.play('lampClick');
  }

  _leave() {
    this.audio.play('error');
    this._toast("It's late, and the machine is still on.");
  }

  _toast(msg) {
    let t = document.getElementById('world-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'world-toast';
      t.style.cssText = `position:fixed;left:50%;bottom:78px;transform:translateX(-50%);
        padding:9px 16px;background:rgba(12,9,6,.78);border:1px solid rgba(255,194,122,.2);
        border-radius:4px;color:#efe3d2;font-size:12.5px;z-index:25;pointer-events:none;
        transition:opacity .4s ease;backdrop-filter:blur(4px);font-style:italic;`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.style.opacity = '0'; }, 2600);
  }

  // ── per frame ──────────────────────────────────────────────
  update(t, dt) {
    if (this._petCooldown > 0) this._petCooldown -= dt;

    // CRT whine gets louder as you approach
    const d = this.camera.position.distanceTo(
      new THREE.Vector3(DESK.x - 0.30, DESK.h + 0.2, DESK.z - 0.10));
    this.audio.setCRTProximity(Math.max(0, Math.min(1, 1 - (d - 0.4) / 1.6)));

    if (this.fs) this.fs.material.uniforms.uTime.value = t;

    if (this.mode === 'walk') {
      this._updatePrompt();
      return;
    }

    if (this.mode === 'inCRT' || this.mode === 'inBed') return;

    // transitions
    this.blend += dt / this.duration;
    const k = easeInOut(Math.min(1, this.blend));
    this.camera.position.lerpVectors(this.from.pos, this.to.pos, k);
    this.camera.quaternion.slerpQuaternions(this.from.quat, this.to.quat, k);

    if (this.blend >= 1) {
      if (this.mode === 'toCRT') {
        this.mode = 'inCRT';
        this.exitHint?.classList.remove('gone');
        if (this.exitHint) this.exitHint.hidden = false;
        this._syncFullscreenUI();
        setTimeout(() => this.exitHint?.classList.add('gone'), 6000);
      } else if (this.mode === 'toBed') {
        this.mode = 'inBed';
        this._toast('Press E or Esc to get up.');
      } else {
        this.mode = 'walk';
        this.player.enabled = true;
        this.player.lock();
      }
    }
  }

  _updatePrompt() {
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestScore = -Infinity;
    const to = new THREE.Vector3();

    for (const tgt of this.targets) {
      to.copy(tgt.pos).sub(cam.position);
      const dist = to.length();
      if (dist > tgt.radius + 0.5) continue;
      to.normalize();
      const dot = to.dot(fwd);
      if (dot < 0.62) continue;
      // prefer things you're looking straight at and standing near
      const score = dot * 2.2 - dist * 0.6;
      if (score > bestScore) { bestScore = score; best = tgt; }
    }

    this.target = best;
    if (best) {
      this.prompt.hidden = false;
      this.promptLabel.textContent = best.label;
      this.hud.classList.add('near');
    } else {
      this.prompt.hidden = true;
      this.hud.classList.remove('near');
    }
  }

  dispose() {
    document.removeEventListener('keydown', this._onKey);
    removeEventListener('mousemove', this._onMove);
    removeEventListener('mousedown', this._onDown);
    removeEventListener('mouseup', this._onUp);
    removeEventListener('wheel', this._onWheel);
    removeEventListener('contextmenu', this._onCtx);
    removeEventListener('resize', this._onResize);
  }
}
