// Liga as regras (sim.js) à tela, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { Game, DT, ROOM, PADDLE, REACH, KIND, LIVES, POWER, KING } from './sim.js';
import { LEVELS, WORLDS, LEVELS_PER_WORLD } from './levels.js';
import { makeRobot } from './robot.js';
import { buildWorld, BrickView, BallView, RockView, buildPaddle, buildCore, buildKing, buildNet, Particles, THEMES } from './scene.js';
import { Panel, Label, C as UI } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, rankOf, addScore } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
sfx.musicOn = save.music;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SIDES = ['left', 'right'];
const POWER_NAME = { fire: 'Bola de fogo', net: 'Rede atrás de você', slow: 'Bola lenta', big: 'Raquetão' };
const POWER_COLOR = { fire: '#ff8a3a', net: '#5affc8', slow: '#ffe65a', big: '#c08aff' };
const BOSS_NAME = { wall: 'Muralha', totem: 'Totem', king: 'Rei' };

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld();
const { scene } = world;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 60);
const rig = new THREE.Group();          // VR: referência do óculos (recentralizar põe a cabeça em x = 0, z = 0)
scene.add(rig);
rig.add(camera);
const PC_CAM = new THREE.Vector3(0, 1.45, 1.05);

const bricksView = new BrickView(scene);
const ballsView = new BallView(scene, world.glowTex);
const rocksView = new RockView(scene);
const particles = new Particles(scene);
const net = buildNet();
scene.add(net);
const paddles = [buildPaddle('#5ad0ff'), buildPaddle('#ff7a59')];
for (const p of paddles) { p.group.visible = false; scene.add(p.group); }
const core = buildCore(); core.group.visible = false; scene.add(core.group);
const king = buildKing(); king.group.visible = false; scene.add(king.group);
const HIDE_IN_BRICKS = new Set(['core', 'king']);

// menus e placas
const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const msgLabel = new Label(0.9, 1024, 128);     // avisos (VR), seguem a cabeça devagar
scene.add(msgLabel.mesh);
msgLabel.mesh.visible = false;

// ---------- Estado ----------
let app = 'menu';            // 'menu' | 'playing' | 'paused' | 'done' | 'initials'
let mode = 'level';          // 'level' (fase avulsa) | 'arcade' (fliperama: as 12 seguidas)
let level = 0;
let game = null;
let robot = makeRobot();
let demo = true;             // no menu do PC o robô joga sozinho, ao fundo, sem som
let msg = null;
let doneTimer = 0;
let lastResult = null, newRecord = false;
const arcade = { score: 0, lives: LIVES, rank: -1, over: false, letters: [0, 0, 0], slot: 0 };

const unlocked = (i) => i === 0 || !!save.done[i - 1];
const nextLevel = () => { let n = 0; while (n < LEVELS.length - 1 && save.done[n]) n++; return n; };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function newGame(lv, opts = {}) {
  level = clamp(lv, 0, LEVELS.length - 1);
  const th = THEMES[LEVELS[level].world];
  world.setTheme(LEVELS[level].world);
  bricksView.setTheme(th);
  game = new Game(level, opts);
  robot.reset();
  acc = 0;
  sfx.setSong(LEVELS[level].world, !demo);
}

function startLevel(lv, m = mode) {
  mode = m;
  demo = false;
  arcade.counted = false;
  newGame(lv, { seed: Math.floor(Math.random() * 1e6), lives: mode === 'arcade' ? arcade.lives : LIVES });
  app = 'playing';
  doneTimer = 0;
  panel.hide();
  const L = LEVELS[level], W = WORLDS[L.world];
  const head = level % LEVELS_PER_WORLD === 0 ? `${W.name}. ${W.hint}` : L.boss ? `Chefe: ${L.name}!` : `Fase ${level + 1}: ${L.name}`;
  showMsg(head, 5, '#fbf1e6');
  sfx.coin();
  updateHint();
}

function startArcade() {
  arcade.score = 0; arcade.lives = LIVES; arcade.rank = -1; arcade.over = false;
  startLevel(0, 'arcade');
}

function togglePause() {
  if (app === 'playing') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); }
  sfx.setSong(LEVELS[level].world, app === 'playing');
  updateHint();
}

function goMenu() {
  app = 'menu';
  demo = !renderer.xr.isPresenting;
  newGame(nextLevel(), { seed: Math.floor(Math.random() * 1e6), serveDelay: demo ? 1 : 1e9 });
  showScreen('main');
  updateHint();
}

function showMsg(text, t = 2, color = '#ffd25a') { msg = { text, t, color }; }
const pad6 = (n) => String(Math.max(0, Math.round(n))).padStart(6, '0');
const totalStars = () => Object.values(save.done).reduce((s, d) => s + (d.stars || 0), 0);

// ---------- Menus ----------
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  placePanel();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Bate-Tijolo', 76, 72);
      p.text('Você é a raquete: rebata a bola e derrube a parede de tijolos.', 512, 136, { size: 26, color: UI.dim });
      const next = nextLevel();
      p.button(save.done[0] ? `Continuar: fase ${next + 1}` : 'Começar', () => startLevel(next, 'level'), 262, 172, 500, 86, { size: 38 });
      p.button('Fliperama (as 12 seguidas)', () => startArcade(), 262, 272, 500, 74, { size: 30 });
      p.button('Escolher fase', () => showScreen('levels'), 262, 360, 245, 70, { size: 28 });
      p.button('Recordes', () => showScreen('scores'), 517, 360, 245, 70, { size: 28 });
      p.button('Como jogar', () => showScreen('help'), 262, 444, 500, 66, { size: 28 });
      const opt = (label, key, x, after) => p.button(`${label}: ${save[key] ? 'sim' : 'não'}`, () => { save[key] = !save[key]; storeSave(save); after?.(); showScreen('main'); }, x, 526, 220, 60, { size: 24 });
      opt('Som', 'sound', 152, () => sfx.setOn(save.sound));
      opt('Música', 'music', 402, () => sfx.setMusic(save.music));
      opt('FPS', 'fps', 652);
      p.text(`Estrelas: ${totalStars()} de ${LEVELS.length * 3}${save.scores[0] ? `   ·   Recorde: ${save.scores[0].name} ${save.scores[0].score}` : ''}`, 512, 622, { size: 25, color: UI.star });
      p.text(vr ? 'Aponte e aperte o gatilho para escolher' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 670, { size: 21, color: UI.dim });
    } else if (name === 'levels') {
      p.title('Escolher fase', 56, 48);
      WORLDS.forEach((W, w) => {
        const y = 100 + w * 190;
        p.text(W.name, 512, y + 6, { size: 26, bold: true, color: ['#ff9a5a', '#5ff2e0', '#ff6ab8'][w] });
        for (let k = 0; k < LEVELS_PER_WORLD; k++) {
          const i = w * LEVELS_PER_WORLD + k, L = LEVELS[i], d = save.done[i];
          p.tile(112 + k * 205, y + 26, 190, 140, { num: i + 1, name: L.boss ? `Chefe: ${L.name}` : L.name, stars: d?.stars || 0, done: !!d, locked: !unlocked(i), master: !!L.boss, action: () => startLevel(i, 'level') });
        }
      });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 652, 300, 56, { size: 28 });
    } else if (name === 'scores') {
      p.title('Recordes do fliperama', 60, 50);
      if (!save.scores.length) p.text('Ninguém ainda. Jogue o Fliperama: as 12 fases seguidas!', 512, 300, { size: 28, color: UI.dim });
      save.scores.forEach((e, i) => {
        const y = 130 + i * 56, hl = mode === 'arcade' && arcade.over && i === arcade.rank;
        p.text(`${i + 1}.`, 250, y, { size: 34, bold: true, color: hl ? UI.edge : UI.dim, align: 'right' });
        p.text(e.name, 300, y, { size: 38, bold: true, color: hl ? UI.edge : UI.text, align: 'left' });
        p.text(pad6(e.score), 620, y, { size: 38, bold: true, color: hl ? UI.edge : UI.star, align: 'right' });
        p.text(e.level >= 12 ? 'zerou!' : `fase ${e.level}`, 660, y, { size: 26, color: UI.dim, align: 'left' });
      });
      p.button('Fliperama', () => startArcade(), 262, 588, 245, 80, { size: 30 });
      p.button('Voltar', () => showScreen('main'), 517, 588, 245, 80, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 56);
      const rows = vr ? [
        'Sua mão é a raquete (as duas mãos rebatem). Aponte para onde quer mandar.',
        'Bata mais rápido para a bola ir mais forte. Incline a raquete para mirar.',
        'Gire o pulso na hora da batida: a bola faz curva para o lado.',
        'Se a bola passar por você, perde uma vida. A raquete vibra na batida.',
      ] : [
        'O mouse leva a raquete. A bola sai para onde a raquete aponta:',
        'bater perto da borda manda para o lado. Mexer o mouse rápido = força.',
        'Q e E giram a raquete: a bola faz curva.  Esc ou P: pausa.',
        'Se a bola passar por você, perde uma vida.',
      ];
      rows.forEach((t, i) => p.text(t, 50, 112 + i * 46, { size: 24, align: 'left' }));
      const sp = [
        ['Duro: 3 batidas', '#9aa0aa'], ['Ímã: puxa a bola', '#ff6a7a'], ['Bola extra', '#ffffff'], ['Andante: anda', '#5ad0ff'],
        ['Bomba: quebra vizinhos', '#ff6a5a'], ['Fogo: atravessa', '#ff8a3a'], ['Rede: salva 1 vez', '#5affc8'], ['Relógio: bola lenta', '#ffe65a'],
        ['Raquetão', '#c08aff'], ['Pedra: não quebra', '#a89a88'],
      ];
      sp.forEach(([t, c], i) => p.text(t, 70 + (i % 2) * 460, 316 + Math.floor(i / 2) * 44, { size: 24, align: 'left', color: c }));
      p.text('Chefes na 4ª fase de cada mundo. Estrelas pelo tempo (cada vida perdida = +15 s).', 512, 552, { size: 22, color: UI.dim });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 76);
    } else if (name === 'pause') {
      p.title('Pausa', 64);
      p.text(`Fase ${level + 1}: ${LEVELS[level].name}${mode === 'arcade' ? '  ·  fliperama' : ''}`, 512, 122, { size: 28, color: UI.dim });
      p.button('Continuar', () => togglePause(), 262, 160, 500, 84);
      p.button(mode === 'arcade' ? 'Recomeçar o fliperama' : 'Recomeçar a fase', () => (mode === 'arcade' ? startArcade() : startLevel(level)), 262, 258, 500, 80, { size: 30 });
      p.button('Recentralizar', () => { recenter(); togglePause(); }, 262, 352, 245, 80, { size: 28, locked: !vr });
      p.button('Como jogar', () => showScreen('help'), 517, 352, 245, 80, { size: 28 });
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; storeSave(save); sfx.setOn(save.sound); showScreen('pause'); }, 262, 446, 245, 72, { size: 26 });
      p.button(`Música: ${save.music ? 'sim' : 'não'}`, () => { save.music = !save.music; storeSave(save); sfx.setMusic(save.music); showScreen('pause'); }, 517, 446, 245, 72, { size: 26 });
      p.button('Menu principal', () => goMenu(), 262, 560, 500, 80);
    } else if (name === 'done') {
      const r = lastResult, d = save.done[level], L = LEVELS[level];
      if (r.won) {
        p.title(newRecord ? 'Parede no chão! Recorde!' : 'Parede no chão!', 66, 54);
        p.stars(r.stars, 512, 140, 74);
        p.text(`Tempo ${r.time.toFixed(0)} s  ·  vidas perdidas ${r.livesLost}  ·  combo ${r.bestCombo}`, 512, 212, { size: 28 });
        p.text(`Pontos ${r.score}  (bônus ${r.bonus})`, 512, 256, { size: 34, bold: true, color: UI.edge });
        p.text(`3 estrelas até ${L.par[0]} s · 2 até ${L.par[1]} s (cada vida perdida = +15 s)`, 512, 298, { size: 21, color: UI.dim });
        if (d) p.text(`Melhor: ${d.stars} estrela${d.stars === 1 ? '' : 's'} · ${d.score} pontos`, 512, 332, { size: 22, color: UI.dim });
      } else {
        p.title(mode === 'arcade' ? 'Fim de jogo' : 'Acabaram as vidas', 70, 58);
        p.text(`Faltaram ${game.left} ${L.boss && L.boss !== 'wall' ? 'batidas no chefe' : 'tijolos'}`, 512, 160, { size: 32, color: UI.red });
        p.text('Dica: bata mais forte (mais rápido) e mire nos tijolos especiais.', 512, 214, { size: 25 });
      }
      if (mode === 'arcade') {
        p.text(`Fliperama: ${pad6(arcade.score)} pontos  ·  vidas ${arcade.lives}`, 512, 384, { size: 30, bold: true, color: UI.star });
        if (r.won && level < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(level + 1, 'arcade'), 262, 420, 500, 92, { size: 38 });
        else p.button('Recordes', () => showScreen('scores'), 262, 420, 500, 92, { size: 38 });
        p.button('Menu principal', () => goMenu(), 262, 540, 500, 78);
      } else {
        if (level < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(level + 1, 'level'), 262, 372, 500, 90, { size: 36, locked: !unlocked(level + 1) });
        else if (r.won) p.text('Você derrubou as 12 paredes!', 512, 416, { size: 34, bold: true, color: UI.edge });
        p.button(r.won ? 'Repetir' : 'Tentar de novo', () => startLevel(level, 'level'), 262, 478, 245, 80);
        p.button('Fases', () => showScreen('levels'), 517, 478, 245, 80);
        p.button('Menu principal', () => goMenu(), 262, 576, 500, 78);
      }
    } else if (name === 'initials') {
      p.title('Novo recorde!', 70, 60);
      p.text(`${pad6(arcade.score)} pontos  ·  ${arcade.rank + 1}º lugar`, 512, 140, { size: 34, bold: true, color: UI.star });
      p.text('Escolha suas 3 letras', 512, 190, { size: 26, color: UI.dim });
      for (let k = 0; k < 3; k++) {
        const x = 292 + k * 160;
        p.button('▲', () => { arcade.letters[k] = (arcade.letters[k] + 1) % LETTERS.length; showScreen('initials'); }, x, 220, 120, 70, { size: 36 });
        p.text(LETTERS[arcade.letters[k]], x + 60, 345, { size: 96, bold: true, color: UI.edge });
        p.button('▼', () => { arcade.letters[k] = (arcade.letters[k] + LETTERS.length - 1) % LETTERS.length; showScreen('initials'); }, x, 400, 120, 70, { size: 36 });
      }
      p.button('Gravar', () => {
        const name = arcade.letters.map(i => LETTERS[i]).join('');
        save.name = name;
        addScore(save, name, arcade.score, arcade.reached);
        storeSave(save);
        app = 'done';
        updateHint();
        showScreen('scores');
      }, 262, 520, 500, 90, { size: 40 });
      p.text(vr ? 'Aponte e aperte o gatilho' : 'Teclado: digite as letras (Enter grava)', 512, 650, { size: 22, color: UI.dim });
    }
  });
}

function placePanel() {
  if (renderer.xr.isPresenting) {
    if (panel.mesh.parent !== scene) scene.add(panel.mesh);
    panel.mesh.scale.setScalar(1);
    const e = new THREE.Euler().setFromQuaternion(xrHeadQuat(), 'YXZ');
    const head = xrHeadPos();
    panel.mesh.position.set(head.x - Math.sin(e.y) * 1.1, head.y - 0.05, head.z - Math.cos(e.y) * 1.1);
    panel.mesh.rotation.set(0, e.y, 0);
    return;
  }
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.rotation.set(0, 0, 0);
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
}

function finishLevel() {
  const r = game.result;
  lastResult = r;
  const prev = save.done[level];
  newRecord = false;
  if (r.won) {
    newRecord = !!prev && r.score > prev.score;
    save.done[level] = { stars: Math.max(r.stars, prev?.stars || 0), score: Math.max(r.score, prev?.score || 0), time: Math.min(r.time, prev?.time ?? 1e9) };
    storeSave(save);
  }
  if (mode === 'arcade') {
    arcade.score += r.score;
    arcade.counted = true;
    arcade.lives = r.lives + (r.won && LEVELS[level].boss ? 1 : 0);
    arcade.reached = r.won ? level + 2 : level + 1;   // fase onde parou (13 = zerou)
    if (!r.won || level === LEVELS.length - 1) {
      arcade.over = true;
      arcade.rank = rankOf(save, arcade.score);
      if (arcade.rank >= 0) {
        arcade.letters = [...(save.name || 'AAA')].map(ch => Math.max(0, LETTERS.indexOf(ch)));
        app = 'initials';
        showScreen('initials');
        for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 300 + k * 220);
        updateHint();
        return;
      }
    }
  }
  app = 'done';
  showScreen('done');
  for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 300 + k * 220);
  updateHint();
}

// ---------- Controles do VR ----------
const ctrls = [];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  rig.add(ctrl);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffd25a }));
  laser.visible = false;
  ctrl.add(laser);
  const entry = { ctrl, laser, source: null, side: null, prevButtons: [], hoverIndex: -1 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) {
  try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}
const both = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible && entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } }
}
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5] && (app === 'playing' || app === 'paused')) togglePause();   // B ou Y
    e.prevButtons = b;
  }
}

// ---------- VR: sessão e recentralizar ----------
let recenterIn = 0;
function xrHeadPos() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()) : camera.getWorldPosition(new THREE.Vector3()); }
function xrHeadQuat() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldQuaternion(new THREE.Quaternion()) : camera.getWorldQuaternion(new THREE.Quaternion()); }
function recenter() {
  if (!renderer.xr.isPresenting) return;
  // põe a cabeça no meio do corredor (x = 0, z = 0) olhando para a parede do fundo; a altura fica
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, 0, -head.z);
  if (panel.visible) placePanel();
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 6;
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  if (app === 'menu') goMenu();
  if (panel.visible) setTimeout(placePanel, 150);
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  for (const p of paddles) if (p.group.parent !== scene) scene.add(p.group);
  if (app === 'menu') goMenu();
  if (panel.visible) placePanel();
  onResize();
  updateHint();
});

// ---------- Mouse e teclado (PC) ----------
const mouse = { ndc: new THREE.Vector2(0, -0.2), has: false };
const pcPad = { p: new THREE.Vector3(0.2, 1.3, REACH.hitZ), last: new THREE.Vector3(0.2, 1.3, REACH.hitZ), speed: 0, roll: 0, rollV: 0, q: false, e: false };
const raycaster = new THREE.Raycaster();
const canvas = renderer.domElement;
const padPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -REACH.hitZ);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.has = true;
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
  }
});
canvas.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.has = true;
});
window.addEventListener('blur', () => { pcPad.q = pcPad.e = false; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (app === 'initials') {
    // digitar as letras do recorde no teclado
    if (/^[a-z0-9]$/.test(k)) { arcade.letters[arcade.slot] = LETTERS.indexOf(k.toUpperCase()); arcade.slot = (arcade.slot + 1) % 3; showScreen('initials'); }
    else if (k === 'enter') panel.buttons.at(-1)?.action?.();
    return;
  }
  if (e.repeat) return;
  if (k === 'escape' || k === 'p') { if (app === 'playing' || app === 'paused') togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (k === 'q') pcPad.q = true;
  if (k === 'e') pcPad.e = true;
});
window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === 'q') pcPad.q = false; if (k === 'e') pcPad.e = false; });
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.visible) placePanel();
}
window.addEventListener('resize', onResize);

// raquete do PC: segue o mouse num plano na frente da câmera; a borda inclina (mira)
function updatePcPaddle(dt) {
  raycaster.setFromCamera(mouse.ndc, camera);
  const hit = raycaster.ray.intersectPlane(padPlane, _v);
  if (hit) pcPad.p.set(clamp(hit.x, -1.1, 1.1), clamp(hit.y, 0.35, 2.4), REACH.hitZ);
  const vel = _v2.copy(pcPad.p).sub(pcPad.last).divideScalar(Math.max(1e-4, dt));
  pcPad.last.copy(pcPad.p);
  pcPad.speed += (vel.length() - pcPad.speed) * Math.min(1, dt * 20);
  // Q/E giram a raquete (efeito); solta e ela volta devagar
  pcPad.rollV = (pcPad.e ? 10 : 0) - (pcPad.q ? 10 : 0);
  if (!pcPad.q && !pcPad.e) pcPad.roll *= Math.max(0, 1 - dt * 3);
  pcPad.roll += pcPad.rollV * dt;
  const n = new THREE.Vector3((pcPad.p.x - 0) * 0.28, (pcPad.p.y - 1.35) * 0.22, -1).normalize();
  const u = new THREE.Vector3(Math.sin(pcPad.roll), Math.cos(pcPad.roll), 0);
  u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
  return { p: pcPad.p.toArray(), n: n.toArray(), u: u.toArray(), on: true, push: clamp(pcPad.speed * 0.45, 0, 2.5) };
}

// ---------- Entrada para o jogo ----------
const padState = [{ p: null, n: null, u: null, on: false }, { p: null, n: null, u: null, on: false }];
let pcInput = null;
function vrPaddlePose(i) {
  const e = entryFor(SIDES[i]);
  if (!e) return { on: false };
  const g = paddles[i].group;
  g.updateMatrixWorld(true);
  g.getWorldPosition(_v);
  g.getWorldQuaternion(_q);
  const n = _v2.set(0, 0, -1).applyQuaternion(_q);
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
  return { p: [_v.x, _v.y, _v.z], n: [n.x, n.y, n.z], u: [u.x, u.y, u.z], on: true };
}
// pose das raquetes neste quadro; os passos da física dentro do quadro interpolam entre a pose do
// quadro anterior e esta (senão a velocidade da raquete sairia aos trancos)
let poseNow = [{ on: false }, { on: false }], posePrev = poseNow;
function readPoses() {
  posePrev = poseNow;
  if (app !== 'playing' || dev.autoplay || demo) poseNow = [{ on: false }, { on: false }];
  else if (renderer.xr.isPresenting) poseNow = [vrPaddlePose(0), vrPaddlePose(1)];
  else poseNow = [{ on: false }, pcInput || { on: false }];
}
const lerpA = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
const normA = (a) => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
function lerpPose(a, b, f) {
  if (!b.on) return b;
  if (!a.on) return b;
  return { p: lerpA(a.p, b.p, f), n: normA(lerpA(a.n, b.n, f)), u: normA(lerpA(a.u, b.u, f)), on: true, push: b.push };
}
function buildInput(f) {
  if (dev.autoplay || demo) return robot.step(game);
  return { hands: [lerpPose(posePrev[0], poseNow[0], f), lerpPose(posePrev[1], poseNow[1], f)] };
}

// raquetes: no VR presas aos controles (o centro do disco 12 cm à frente da mão); no PC, no mundo
function placePaddles(vr, dt) {
  const big = game.power.big > 0 ? PADDLE.big : 1;
  const stun = game.stunned > 0;
  for (let i = 0; i < 2; i++) {
    const P = paddles[i], g = P.group;
    P.setBig(big);
    P.setColor(stun ? '#5a5a6a' : i ? '#ff7a59' : '#5ad0ff');
    if (vr && !(dev.autoplay)) {
      const e = entryFor(SIDES[i]);
      g.visible = !!e;
      if (e && g.parent !== e.ctrl) { e.ctrl.add(g); g.position.set(0, 0, -0.12); g.quaternion.identity(); }
      continue;
    }
    if (g.parent !== scene) scene.add(g);
    let pose = null;
    if (dev.autoplay || demo) pose = robot.hands[i] ? { p: robot.hands[i].p, n: robot.hands[i].n } : null;
    else if (i === 1 && app === 'playing') pose = pcInput;
    else if (i === 1 && (app === 'paused' || app === 'done')) pose = pcInput;
    g.visible = !!pose && !(vr && demo);
    if (!pose) continue;
    g.position.set(...pose.p);
    _v.set(...pose.n);
    _q.setFromUnitVectors(_v2.set(0, 0, -1), _v);
    if (pose.u) {
      // gira em volta da normal para seguir o "para cima" da raquete (efeito visível no Q/E)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
      const want = new THREE.Vector3(...pose.u);
      const ang = Math.atan2(up.clone().cross(want).dot(_v), up.dot(want));
      _q.premultiply(new THREE.Quaternion().setFromAxisAngle(_v, ang));
    }
    g.quaternion.copy(_q);
  }
}

function updatePcCamera(dt) {
  if (renderer.xr.isPresenting) return;
  camera.position.copy(PC_CAM);
  // a câmera acompanha a raquete um pouquinho (dá noção de profundidade)
  const px = (pcInput?.p?.[0] || 0) * 0.08;
  camera.position.x += px;
  camera.lookAt(px * 0.5, 1.3, -4);
}

// ---------- Raios do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 1.2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    canvas.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else if (!vr) canvas.style.cursor = app === 'playing' ? 'none' : 'default';
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const msgEl = document.getElementById('msg');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.innerHTML = app === 'playing'
    ? '<span>Mouse: raquete (rápido = mais força; borda = mira de lado) · Q/E: efeito · Esc: pausa</span>'
    : app === 'initials' ? '<span>Digite as 3 letras e aperte Enter</span>' : '<span>Clique nas opções do painel</span>';
}
function powersList() {
  return Object.entries(game.power).filter(([, t]) => t > 0).map(([k, t]) => ({ k, t }));
}
function updateBoard() {
  const playing = app !== 'menu' || demo;
  if (!game || (app === 'menu' && !demo)) {
    world.setBoard([{ text: 'BATE-TIJOLO', x: 512, align: 'center', size: 76, color: '#ffd25a' }]);
    return;
  }
  if (app === 'menu') {
    const best = save.scores[0];
    world.setBoard([
      { text: 'BATE-TIJOLO', x: 30, size: 62, color: '#ffd25a' },
      { text: best ? `RECORDE ${best.name} ${pad6(best.score)}` : 'INSIRA FICHA', x: 994, align: 'right', size: 44, color: '#ff6ab8' },
    ]);
    return;
  }
  const score = mode === 'arcade' ? arcade.score + (arcade.counted ? 0 : game.score) : game.score;
  const L = LEVELS[level];
  let left = `FASE ${level + 1}`;
  if (L.boss && L.boss !== 'wall' && game.core) {
    const k = Math.round(10 * game.core.hp / game.core.maxHp);
    left = `${BOSS_NAME[L.boss].toUpperCase()} ${'■'.repeat(k)}${'□'.repeat(10 - k)}`;
  }
  world.setBoard([
    { text: left, x: 26, size: L.boss && L.boss !== 'wall' ? 40 : 54, color: L.boss ? '#ff6ab8' : '#5ff2e0' },
    { text: pad6(score), x: 600, align: 'center', size: 70, color: '#ffd25a' },
    { text: '♥'.repeat(Math.max(0, game.lives)), x: 1000, align: 'right', size: 56, color: '#ff5a6a' },
  ]);
  void playing;
}
function updateHud(dt) {
  const vr = renderer.xr.isPresenting;
  const playing = (app === 'playing' || app === 'done' || app === 'paused') && !!game && !demo;
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  updateBoard();
  if (!vr) {
    msgLabel.mesh.visible = false;
    hudEl.style.display = playing ? 'block' : 'none';
    if (playing) {
      const L = LEVELS[level];
      const pw = powersList().map(({ k, t }) => `<div style="color:${POWER_COLOR[k]}">${POWER_NAME[k]}${k === 'net' ? '' : ` ${Math.ceil(t)} s`}</div>`).join('');
      const html = `<b>${level + 1}. ${L.name}</b><br><em>${WORLDS[L.world].name}${mode === 'arcade' ? ' · fliperama' : ''}</em>`
        + `<div>Tempo ${Math.floor(game.result?.time ?? game.t)} s · ${L.boss && L.boss !== 'wall' ? `chefe: faltam ${game.left}` : `faltam ${game.left} tijolos`}</div>`
        + (game.combo > 1 ? `<div style="color:#ffd25a">Combo x${game.combo}</div>` : '')
        + (game.boss === 'king' ? `<div style="color:${game.kingOpen ? '#7ff5d0' : '#ffb02a'}">${game.kingOpen ? 'Rei sem proteção: acerte ele!' : `Quebre ${KING.open} guardas para abrir o Rei`}</div>` : '')
        + pw;
      if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
    }
    const mtxt = msg && playing ? msg.text : '';
    if (msgEl.dataset.last !== mtxt) { msgEl.textContent = mtxt; msgEl.style.color = msg?.color || '#fff'; msgEl.dataset.last = mtxt; }
    msgEl.style.display = mtxt ? 'block' : 'none';
    return;
  }
  hudEl.style.display = msgEl.style.display = 'none';
  msgLabel.mesh.visible = playing && !!msg;
  if (!playing) return;
  const hp = xrHeadPos(), hq = xrHeadQuat();
  const fwd = _v.set(0, 0, -1).applyQuaternion(hq);
  const up = _v2.set(0, 1, 0).applyQuaternion(hq);
  const k = Math.min(1, dt * 2.5);
  const tgt = hp.clone().addScaledVector(fwd, 1.4).addScaledVector(up, 0.32);
  msgLabel.mesh.position.lerp(tgt, msgLabel.mesh.visible ? k : 1);
  msgLabel.mesh.lookAt(hp);
  if (msg) msgLabel.set([{ text: msg.text, size: 0.62, color: msg.color, bold: false }]);
}

// ---------- Eventos do jogo -> som, vibração, avisos, efeitos ----------
const brickById = (id) => game.bricks[id];
function handleEvents(evs) {
  const quiet = demo;
  for (const ev of evs) {
    switch (ev.type) {
      case 'paddle': {
        particles.burst(ev.p, '#fff4d8', 8, 1.5, 0.25, 0.025, 0);
        if (!quiet) {
          sfx.paddle(ev.speed, ev.p, ev.curve);
          pulse(SIDES[ev.hand], 0.35 + 0.5 * clamp((ev.speed - 3) / 3.5, 0, 1), 28);
          if (ev.curve > 0.7) showMsg('Com efeito!', 0.9, '#5ff2e0');
        }
        break;
      }
      case 'wall': if (!quiet) sfx.wall(ev.p); break;
      case 'break': {
        const b = brickById(ev.id);
        const c = b ? bricksView.colorOf(b) : '#ffffff';
        particles.burst(ev.p, c, 22, 2.2, 0.9, 0.05);
        particles.burst(ev.p, '#ffffff', 6, 1.2, 0.3, 0.03, 0);
        if (!quiet) {
          sfx.brick(ev.kind, ev.combo, ev.p);
          if (ev.combo >= 3 && ev.combo % 2 === 1) showMsg(`Combo x${ev.combo}!`, 1.2, '#ffd25a');
        }
        break;
      }
      case 'crack':
        bricksView.hit(ev.id);
        particles.burst(ev.p, '#c8c8d0', 8, 1.2, 0.5, 0.03);
        if (!quiet) {
          if (ev.kind === 'core' || ev.kind === 'king') { sfx.bossHit(ev.p); flashBoss = 0.25; both(0.3, 40); }
          else sfx.crack(ev.p);
        }
        break;
      case 'ping':
        bricksView.hit(ev.id);
        if (!quiet) {
          if (brickById(ev.id)?.type === 'king') { sfx.closedHit(ev.p); if (!msg) showMsg(`O Rei está protegido: quebre ${KING.open} guardas primeiro`, 2, '#ffb02a'); }
          else sfx.ping(ev.p);
        }
        break;
      case 'power': if (!quiet) { sfx.power(ev.kind); showMsg(`${POWER_NAME[ev.kind]}!`, 2, POWER_COLOR[ev.kind]); } break;
      case 'power-end': if (!quiet) sfx.powerEnd(); break;
      case 'extra-ball': particles.burst(ev.p, '#ffffff', 20, 1.5, 0.6, 0.04, 0); if (!quiet) { sfx.extraBall(ev.p); showMsg('Bola extra!', 1.5, '#ffffff'); } break;
      case 'bomb': particles.burst(ev.p, '#ff8a3a', 60, 3.5, 0.9, 0.07); particles.burst(ev.p, '#ffe85a', 30, 2, 0.4, 0.06, 0); if (!quiet) sfx.bomb(ev.p); break;
      case 'net-save': particles.burst(ev.p, '#5affc8', 30, 1.5, 0.5, 0.04, 0); if (!quiet) { sfx.netSave(ev.p); both(0.5, 60); showMsg('A rede salvou!', 1.5, '#5affc8'); } break;
      case 'serve': if (!quiet) sfx.serve(); break;
      case 'lost-ball':
        if (!quiet) {
          sfx.lostBall(); both(0.8, 200);
          if (ev.lives > 0) showMsg(ev.lives === 1 ? 'Última vida!' : `Perdeu a bola! Restam ${ev.lives} vidas`, 2, '#ff5a6a');
        }
        break;
      case 'ball-gone': if (!quiet) sfx.ballGone(); break;
      case 'wall-crash': particles.burst(ev.p, '#c8a07a', 50, 2, 1.2, 0.08); if (!quiet) { sfx.wallCrash(ev.p); both(1, 300); showMsg('A Muralha chegou em você! Ela recuou.', 2.5, '#ff5a6a'); } break;
      case 'respawn': particles.burst(ev.p, '#ffffff', 8, 0.8, 0.4, 0.03, 0); if (!quiet) sfx.respawn(ev.p); break;
      case 'boss-down':
        for (let k = 0; k < 6; k++) later.push({ t: time + k * 0.18, fn: () => particles.burst(ev.p.map((v, j) => v + (Math.random() - 0.5) * (j === 2 ? 0.4 : 1)), ['#ffd25a', '#ff6ab8', '#5ff2e0'][k % 3], 40, 3, 1, 0.07) });
        if (!quiet) { sfx.bossDown(ev.p); showMsg(`${BOSS_NAME[ev.kind]} derrotado!`, 3, '#ffd25a'); }
        break;
      case 'rock-throw': if (!quiet) { sfx.rockThrow(ev.p); if (!msg) showMsg('Pedra! Rebata antes que chegue em você', 1.6, '#ffb02a'); } break;
      case 'rock-smash': particles.burst(ev.p, '#9a7a60', 25, 2, 0.7, 0.05); if (!quiet) { sfx.rockSmash(ev.p); both(0.6, 50); } break;
      case 'rock-hit': if (!quiet) { sfx.rockHit(); both(1, 250); showMsg('Tonto! A raquete não rebate por 1 s', 1.6, '#ff8a7a'); } break;
      case 'won': if (!quiet) { sfx.won(); doneTimer = 2.2; showMsg('Parede no chão!', 2.2, '#ffd25a'); } break;
      case 'lost': if (!quiet) { sfx.lost(); both(1, 400); doneTimer = 2.5; showMsg('Acabaram as vidas...', 2.5, '#ff5a6a'); } break;
    }
  }
}

// ---------- Chefes (visual) ----------
let flashBoss = 0;
function updateBossView(dt) {
  const B = game.core;
  core.group.visible = !!B && B.type === 'core' && B.alive;
  king.group.visible = !!B && B.type === 'king' && B.alive;
  flashBoss = Math.max(0, flashBoss - dt);
  if (core.group.visible) {
    core.group.position.set(...B.c);
    core.group.rotation.y = Math.sin(time * 0.6) * 0.3;
    core.tent.forEach(({ t, a }, k) => { t.rotation.x = Math.sin(time * 2 + k) * 0.3 * Math.cos(a); t.rotation.z = Math.sin(time * 2 + k) * 0.3 * Math.sin(a); });
    core.mats[0].emissive.set(flashBoss > 0 ? '#ffffff' : '#000000');
  }
  if (king.group.visible) {
    king.group.position.set(...B.c);
    king.group.rotation.z = Math.sin(time * 1.3) * 0.08;
    king.shield.visible = !game.kingOpen;
    king.shield.material.opacity = 0.14 + 0.06 * Math.sin(time * 5);
    king.mats[0].emissive.set(flashBoss > 0 ? '#ffffff' : '#000000');
  }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const okXR = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!okXR) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now(), time = 0;
let fpsFrames = 0, fpsTime = 0;
const later = [];
const _lf = new THREE.Vector3(), _lu = new THREE.Vector3();

function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();
  rig.updateMatrixWorld(true);
  updatePcCamera(dt);
  camera.updateMatrixWorld(true);
  if (!vr) pcInput = mouse.has || app === 'playing' ? updatePcPaddle(dt) : null;
  placePaddles(vr, dt);

  const running = app === 'playing' || app === 'done' || app === 'menu' || app === 'initials';
  if (running) {
    acc += dt;
    const n = Math.min(12, Math.floor(acc / DT));
    if (n > 0) readPoses();
    for (let i = 0; i < n; i++) {
      game.step(buildInput((i + 1) / n));
      handleEvents(game.events);
    }
    acc -= n * DT;
    if (demo && game.over) newGame(Math.floor(Math.random() * LEVELS.length), { seed: Math.floor(Math.random() * 1e6), serveDelay: 1 });
  } else acc = 0;
  if (app === 'playing' && doneTimer > 0) { doneTimer -= dt; if (doneTimer <= 0) finishLevel(); }
  for (let i = later.length - 1; i >= 0; i--) if (time >= later[i].t) { later[i].fn(); later.splice(i, 1); }

  // visual
  const ahead = app === 'paused' ? 0 : acc;
  bricksView.update(game.bricks, dt, time, HIDE_IN_BRICKS);
  ballsView.update(game.balls, game.power.fire > 0, ahead, time);
  rocksView.update(game.rocks, ahead, time);
  updateBossView(dt);
  net.visible = game.power.net > 0;
  if (net.visible) net.material.opacity = 0.35 + 0.15 * Math.sin(time * 6);
  if (app !== 'paused') {
    // rastro da bola
    for (const b of game.balls) particles.spawn(b.p[0], b.p[1], b.p[2], 0, 0, 0, game.power.fire > 0 ? 0.35 : 0.18, game.power.fire > 0 ? 0.06 : 0.035, game.power.fire > 0 ? '#ff7a1a' : '#ffe6b0', 0);
    particles.update(dt);
  }
  particles.mat.uniforms.uScale.value = vr ? 800 : renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  world.update(app === 'paused' ? 0 : dt, time);
  updateHud(dt);
  updateMenuRays();

  if (sfx.ctx) {
    const hq = xrHeadQuat();
    sfx.setListener(xrHeadPos(), _lf.set(0, 0, -1).applyQuaternion(hq), _lu.set(0, 1, 0).applyQuaternion(hq));
  }

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.loadLevel(5)      abre a fase 5 (1 a 12)
// dev.autoplay = true   o robô joga (mãos com limites humanos)
// dev.advance(20)       avança 20 s de jogo na hora, sem esperar a animação
// dev.state()           resumo: tela, fase, vidas, pontos, bolas, tijolos, poderes, chefe
// dev.snapshot()        imagem da tela (JPEG em data URL)
// dev.arcade()          começa o fliperama
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; robot.reset(); updateHint(); },
  loadLevel(n) { startLevel(clamp(n, 1, LEVELS.length) - 1, 'level'); return this.state(); },
  arcade() { startArcade(); return this.state(); },
  advance(sec, step = 1 / 72) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  state() {
    return {
      tela: app, modo: mode, fase: level + 1, nome: LEVELS[level].name, mundo: WORLDS[LEVELS[level].world].name,
      tempo: +game.t.toFixed(1), vidas: game.lives, pontos: game.score, fliperama: mode === 'arcade' ? arcade.score : null,
      bolas: game.balls.map(b => ({ p: b.p.map(v => +v.toFixed(2)), velocidade: +Math.hypot(...b.v).toFixed(2), saque: b.serve })),
      faltam: game.left, combo: game.combo, poderes: Object.fromEntries(Object.entries(game.power).filter(([, t]) => t > 0).map(([k, t]) => [k, +t.toFixed(1)])),
      chefe: game.core ? { vida: game.core.hp, aberto: game.boss === 'king' ? game.kingOpen : undefined } : null,
      muralha: game.boss === 'wall' ? +game.wallZ.toFixed(2) : undefined,
      resultado: game.result, salvo: save.done[level] || null,
    };
  },
  snapshot(w = 960) {
    renderer.render(scene, camera);
    const src = renderer.domElement, c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  },
  resetSave() { save.done = {}; save.scores = []; storeSave(save); },
};
window.dev = dev;
window.tijolo = { dev, get game() { return game; }, save, sfx, robot, startLevel, startArcade, goMenu, camera, scene, renderer, KIND, POWER };

goMenu();
renderer.setAnimationLoop(frame);
