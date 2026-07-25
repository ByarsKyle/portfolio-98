// ─────────────────────────────────────────────────────────────
// Portfolio '98 — entry point.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createEngine, buildEnvironment } from './core/engine.js';
import { buildLighting } from './core/lighting.js';
import { Player } from './core/controls.js';
import { bakeAll } from './forge/materials.js';
import { buildRoom, ROOM } from './assets/room.js';
import { buildFurniture } from './assets/furniture.js';
import { buildDesktop } from './assets/desktop.js';
import { buildPug } from './assets/pug.js';
import { buildProps } from './assets/props.js';
import { Interaction } from './core/interaction.js';
import { Audio } from './core/audio.js';

const el = (id) => document.getElementById(id);
const loader = el('loader');
const fill = el('loader-fill');
const taskEl = el('loader-task');
const logEl = el('loader-log');

let logLines = [];
function log(line) {
  logLines.push(line);
  if (logLines.length > 5) logLines.shift();
  logEl.innerHTML = logLines.map((l, i) =>
    `<div style="opacity:${0.35 + i * 0.16}"><b>›</b> ${l}</div>`).join('');
}
function progress(p, label) {
  fill.style.width = `${Math.round(p * 100)}%`;
  if (label) taskEl.textContent = label;
}

const canvas = el('view');
const { renderer, scene, camera, composer, bloom, grade } = createEngine(canvas);

async function boot() {
  const t0 = performance.now();

  progress(0.02, 'compiling shaders');
  log('forge online');
  await frame();

  // ── 1. bake every material
  progress(0.05, 'baking materials');
  await bakeAll((p, name) => {
    progress(0.05 + p * 0.42, `baking material: ${name}`);
    if (name !== 'done') log(`baked <b>${name}</b>`);
  });

  // ── 2. environment IBL
  progress(0.50, 'generating environment map');
  log('rendering procedural IBL');
  await frame();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color(0x07060a);

  // ── 3. geometry
  progress(0.56, 'building the room');
  log('framing walls, laying floor');
  await frame();
  const room = buildRoom(scene);

  progress(0.64, 'placing lights');
  await frame();
  const lights = buildLighting(scene);

  progress(0.70, 'simulating bedding');
  log('relaxing 3,400 cloth vertices');
  await frame();
  const furniture = buildFurniture(scene);

  progress(0.80, 'assembling the computer');
  log('degaussing CRT, spinning platters');
  await frame();
  const desktop = buildDesktop(scene);

  progress(0.88, 'growing a pug');
  log('108,000 fur shells');
  await frame();
  const pug = buildPug(scene);

  progress(0.94, 'scattering the small stuff');
  await frame();
  const props = buildProps(scene);

  progress(0.98, 'warming up');
  log(`ready in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  await frame();

  // ── player + interaction
  const player = new Player(camera, canvas);
  player.setColliders([
    ...furniture.colliders, ...desktop.colliders, ...props.colliders,
  ]);

  const audio = new Audio();
  const interaction = new Interaction({
    scene, camera, player, desktop, lights, grade, audio, bloom, pug, props,
  });

  player.onStep = (running) => audio.footstep(running);
  player.onLockChange = (locked) => {
    if (!locked && !interaction.inCRT) el('hint')?.classList.remove('gone');
  };

  // Warm the shader cache by rendering one throwaway frame. (renderer.compile()
  // builds programs against a lights state captured outside a real render, and
  // the programs it produces come out unlit — a full render primes the same
  // cache correctly.)
  renderer.render(scene, camera);

  progress(1, 'ready');
  await frame();

  loader.classList.add('gone');
  setTimeout(() => { loader.hidden = true; }, 900);
  el('start').hidden = false;

  // debug hook — used by the screenshot harness and handy in the console
  window.__room = {
    scene, camera, renderer, player, lights, desktop, pug, interaction, composer,
    look(x, y, z, yaw, pitch) {
      player.pos.set(x, y, z);
      player.yaw = yaw; player.pitch = pitch ?? 0;
      player.enabled = true; player.locked = true;
      player.update(0.016);
      player.locked = false;
    },
    ready: true,
  };

  el('start-btn').onclick = () => {
    el('start').classList.add('gone');
    setTimeout(() => { el('start').hidden = true; }, 700);
    el('hud').hidden = false;
    player.lock();
    audio.start();
    setTimeout(() => el('hint')?.classList.add('gone'), 9000);
  };

  // ── loop
  const clock = new THREE.Clock();
  let t = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    player.update(dt);
    lights.update(t, dt);
    furniture.update?.(t, dt);
    pug.update(t, dt, camera);
    desktop.update(t, dt, camera);
    props.update?.(t, dt);
    interaction.update(t, dt);
    grade.uniforms.uTime.value = t;
    composer.render();
  });
}

const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

boot().catch((err) => {
  console.error(err);
  taskEl.textContent = 'something broke while building the room';
  log(`<span style="color:#c66">${err.message}</span>`);
});
