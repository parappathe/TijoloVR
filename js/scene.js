// Cena 3D: o corredor de cada mundo (paredes, chão, teto e enfeites), o letreiro do placar,
// tijolos instanciados com ícones, bolas, pedras, raquetes, chefes e partículas.
// Desempenho de Quest: sem sombras, sem pós-processamento, tijolos e ícones em InstancedMesh.
import * as THREE from '../vendor/three/three.module.js';
import { ROOM, GRID, BALL, PADDLE, TOTEM, KING, MAX_BALLS } from './sim.js';

// ---------- temas dos mundos ----------
export const THEMES = [
  { // Oficina do Oleiro: reboco, vigas de madeira, lâmpadas quentes
    name: 'oficina', fog: '#2a160c', fogNear: 9, fogFar: 26, bg: '#1a0e08',
    wall: ['#c9a27a', '#b58a62'], floor: ['#7a4a2a', '#5e361c'], ceil: ['#4a2e1c', '#3a2214'],
    trim: '#4a2a14', glow: '#ffb35a', glow2: '#ff7a3a', hemi: ['#ffe0b8', '#4a2a18', 1.5], sun: ['#ffd8a8', 1.4],
    bricks: ['#e8553a', '#f08a3a', '#f2c14e', '#7fb35a', '#4aa3c8', '#c0607a'], hard: '#7a7f8a',
  },
  { // Aquário Fundo: vidro com água em volta, areia, luz azul
    name: 'aquario', fog: '#05303a', fogNear: 7, fogFar: 22, bg: '#03222c',
    wall: ['#1f6f7f', '#175868'], floor: ['#c8b07a', '#a8905a'], ceil: ['#0f4652', '#0b3842'],
    trim: '#0b2c36', glow: '#5ff2e0', glow2: '#ffd85a', hemi: ['#a8f0ff', '#0a3040', 1.6], sun: ['#c8f8ff', 1.2],
    bricks: ['#ff7a8a', '#ffb05a', '#ffe36a', '#5fe0b0', '#5ab8ff', '#b88aff'], hard: '#5a7a88',
  },
  { // Fornalha Neon: metal escuro, faixas de neon, brasa embaixo da grade
    name: 'fornalha', fog: '#12040e', fogNear: 8, fogFar: 24, bg: '#08020a',
    wall: ['#4a3e5c', '#3a3048'], floor: ['#1a1418', '#120e12'], ceil: ['#2c2438', '#221c2c'],
    trim: '#ff2ab8', glow: '#ff2ab8', glow2: '#2af0ff', hemi: ['#d8c0ff', '#401028', 1.7], sun: ['#ffb0d8', 1.0],
    bricks: ['#ff3a6a', '#ff8a2a', '#ffe02a', '#3aff9a', '#2ad8ff', '#c05aff'], hard: '#6a6478',
  },
];

// tipos especiais: cor do tijolo e desenho do ícone
export const SPECIAL = {
  m: '#d23a4a', x: '#f4f4f4', a: '#5ad0ff', b: '#2a2a2a', f: '#ff6a1a', r: '#5affc8', t: '#ffe65a', g: '#b07aff', s: '#7a7268',
  ring: '#ff6aa8', guard: '#ffd24a', core: '#b04aff', king: '#ffb02a',
};

// ---------- texturas desenhadas no canvas ----------
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const rnd = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
function speckle(g, w, h, n, colors, rmax = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.globalAlpha = 0.08 + rnd() * 0.18; g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.5 + rnd() * rmax, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}

function wallTexture(th, kind) {
  const [a, b] = kind === 'floor' ? th.floor : kind === 'ceil' ? th.ceil : th.wall;
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    if (th.name === 'oficina') {
      if (kind === 'floor') {
        // tábuas
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? a : b; g.fillRect(i * 64, 0, 62, h);
          g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(i * 64, ((i * 137) % 512) - 512, 62, 512); g.strokeRect(i * 64, (i * 137) % 512, 62, 512);
          for (let k = 0; k < 14; k++) { g.strokeStyle = 'rgba(40,20,8,0.25)'; g.beginPath(); const x = i * 64 + 6 + rnd() * 50; g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.6, x + 3, h); g.stroke(); }
        }
      } else {
        // reboco com manchas
        speckle(g, w, h, 900, [b, '#e8c8a0', '#8a6040'], 5);
        if (kind === 'wall') { g.fillStyle = 'rgba(60,30,10,0.25)'; g.fillRect(0, h - 70, w, 70); g.fillStyle = '#5a341c'; g.fillRect(0, h - 74, w, 8); }
      }
    } else if (th.name === 'aquario') {
      if (kind === 'floor') { speckle(g, w, h, 2600, [b, '#e8d8a8', '#8a7448', '#fff2c8'], 2.5); for (let k = 0; k < 9; k++) { g.strokeStyle = 'rgba(120,96,50,0.2)'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, k * 60 + 20); g.bezierCurveTo(w * 0.3, k * 60, w * 0.6, k * 60 + 40, w, k * 60 + 20); g.stroke(); } }
      else {
        // vidro: gradiente de água e reflexos
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2aa0b0'); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let k = 0; k < 18; k++) { g.strokeStyle = 'rgba(200,255,255,0.10)'; g.lineWidth = 3 + rnd() * 6; g.beginPath(); const x = rnd() * w; g.moveTo(x, 0); g.bezierCurveTo(x + 40, h * 0.3, x - 40, h * 0.7, x + 20, h); g.stroke(); }
        g.strokeStyle = '#0b2c36'; g.lineWidth = 14; g.strokeRect(0, 0, w, h);
      }
    } else {
      // metal escuro com rebites (e grade no chão)
      speckle(g, w, h, 600, [b, '#3a3444'], 3);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = '#4a4458';
      for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
      if (kind === 'floor') {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { g.fillStyle = (i + j) % 2 ? '#2a2228' : '#221a20'; g.fillRect(i * 32 + 3, j * 32 + 3, 26, 26); }
      }
    }
  }, kind === 'wall' ? [3, 1] : [2, 4]);
}

function brickFaceTexture() {
  // cara do tijolo em tons de cinza (a cor vem de cada instância): borda de argamassa e textura
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8c8c8');
    g.fillStyle = gr; g.fillRect(5, 5, w - 10, h - 10);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(7, 7, w - 14, 4);
    speckle(g, w, h, 160, ['#909090', '#ffffff'], 1.6);
  });
}

// ícones dos tijolos especiais (fundo transparente)
function iconTexture(kind) {
  return canvasTex(128, 64, (g, w, h) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const cx = w / 2, cy = h / 2;
    const stroke = (c, lw) => { g.strokeStyle = c; g.lineWidth = lw; g.stroke(); };
    g.beginPath();
    switch (kind) {
      case 'm': // ímã em U
        g.arc(cx, cy - 4, 16, Math.PI, 0, true); stroke('#ffffff', 10);
        g.fillStyle = '#c8c8d8'; g.fillRect(cx - 21, cy - 6, 10, 10); g.fillRect(cx + 11, cy - 6, 10, 10);
        break;
      case 'x': // duas bolinhas
        g.fillStyle = '#ff5a3a'; g.arc(cx - 14, cy, 11, 0, 7); g.fill(); g.beginPath(); g.arc(cx + 14, cy, 11, 0, 7); g.fill();
        g.fillStyle = '#ffffff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', cx, cy);
        break;
      case 'a': // setas para os lados
        g.moveTo(cx - 34, cy); g.lineTo(cx + 34, cy); g.moveTo(cx - 34, cy); g.lineTo(cx - 22, cy - 10); g.moveTo(cx - 34, cy); g.lineTo(cx - 22, cy + 10);
        g.moveTo(cx + 34, cy); g.lineTo(cx + 22, cy - 10); g.moveTo(cx + 34, cy); g.lineTo(cx + 22, cy + 10); stroke('#0a2a4a', 7);
        break;
      case 'b': // bomba com pavio
        g.fillStyle = '#ff3a2a'; g.arc(cx - 3, cy + 4, 15, 0, 7); g.fill();
        g.beginPath(); g.moveTo(cx + 8, cy - 8); g.quadraticCurveTo(cx + 18, cy - 22, cx + 28, cy - 16); stroke('#ffd85a', 4);
        g.beginPath(); g.fillStyle = '#ffffff'; g.arc(cx + 29, cy - 16, 4, 0, 7); g.fill();
        break;
      case 'f': // chama
        g.moveTo(cx, cy - 24); g.bezierCurveTo(cx + 22, cy - 4, cx + 14, cy + 22, cx, cy + 22); g.bezierCurveTo(cx - 14, cy + 22, cx - 22, cy - 2, cx - 6, cy - 10);
        g.quadraticCurveTo(cx - 2, cy - 2, cx, cy - 24); g.fillStyle = '#ffe85a'; g.fill();
        break;
      case 'r': // rede
        for (let i = -2; i <= 2; i++) { g.moveTo(cx + i * 12, cy - 20); g.lineTo(cx + i * 12, cy + 20); }
        for (let j = -1; j <= 1; j++) { g.moveTo(cx - 28, cy + j * 12); g.lineTo(cx + 28, cy + j * 12); }
        stroke('#0a4a3a', 4);
        break;
      case 't': // relógio
        g.arc(cx, cy, 20, 0, 7); stroke('#3a2a00', 6);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 13); g.moveTo(cx, cy); g.lineTo(cx + 10, cy + 4); stroke('#3a2a00', 5);
        break;
      case 'g': // raquete grande
        g.arc(cx - 6, cy - 4, 17, 0, 7); g.fillStyle = '#ffffff'; g.fill();
        g.beginPath(); g.moveTo(cx + 6, cy + 8); g.lineTo(cx + 22, cy + 22); stroke('#ffffff', 8);
        break;
      case 's': // pedra: rachaduras grossas
        g.moveTo(14, 18); g.lineTo(40, 30); g.lineTo(62, 22); g.lineTo(90, 40); g.lineTo(116, 30); stroke('rgba(0,0,0,0.45)', 4);
        break;
      case 'd': // duro: placa com rebites
        g.strokeStyle = 'rgba(20,20,30,0.55)'; g.lineWidth = 4; g.strokeRect(12, 10, w - 24, h - 20);
        g.fillStyle = 'rgba(230,230,240,0.9)';
        for (const [x, y] of [[20, 17], [w - 20, 17], [20, h - 17], [w - 20, h - 17]]) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
        break;
      case 'crack1': case 'crack2':
        g.moveTo(30, 6); g.lineTo(44, 26); g.lineTo(38, 40); g.lineTo(56, 58);
        if (kind === 'crack2') { g.moveTo(98, 8); g.lineTo(84, 30); g.lineTo(96, 44); g.lineTo(80, 60); g.moveTo(44, 26); g.lineTo(70, 30); g.lineTo(84, 30); }
        stroke('rgba(10,8,8,0.85)', 4);
        break;
      case 'ring': case 'guard':
        g.arc(cx, cy, 14, 0, 7); stroke('rgba(255,255,255,0.8)', 5);
        break;
    }
  });
}

function glowTexture() {
  return canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}

// ---------- mundo ----------
export function buildWorld() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#000', 8, 25);
  const hemi = new THREE.HemisphereLight('#fff', '#333', 1.4);
  const sun = new THREE.DirectionalLight('#fff', 1.2);
  sun.position.set(0.6, 3, 2);
  scene.add(hemi, sun);

  const glowTex = glowTexture();
  const L = -ROOM.zBack + 2.5;   // comprimento do corredor (do fundo até 2,5 m atrás do jogador)
  const zMid = ROOM.zBack + L / 2;
  const W = ROOM.x * 2, H = ROOM.y1;
  const mkPlane = (w, h) => new THREE.PlaneGeometry(w, h);
  const themes = THEMES.map((th) => {
    const g = new THREE.Group();
    const wallM = new THREE.MeshLambertMaterial({ map: wallTexture(th, 'wall') });
    // aquário: as paredes dos lados são vidro (dá para ver os peixes do lado de fora)
    if (th.name === 'aquario') { wallM.transparent = true; wallM.opacity = 0.6; wallM.depthWrite = false; }
    const floorM = new THREE.MeshLambertMaterial({ map: wallTexture(th, 'floor') });
    const ceilM = new THREE.MeshLambertMaterial({ map: wallTexture(th, 'ceil') });
    const backM = new THREE.MeshLambertMaterial({ map: wallTexture(th, 'wall') });
    backM.map = backM.map.clone(); backM.map.repeat.set(1, 1); backM.map.needsUpdate = true;
    const floor = new THREE.Mesh(mkPlane(W, L), floorM); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zMid);
    const ceil = new THREE.Mesh(mkPlane(W, L), ceilM); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, zMid);
    const lw = new THREE.Mesh(mkPlane(L, H), wallM); lw.rotation.y = Math.PI / 2; lw.position.set(-ROOM.x, H / 2, zMid);
    const rw = new THREE.Mesh(mkPlane(L, H), wallM); rw.rotation.y = -Math.PI / 2; rw.position.set(ROOM.x, H / 2, zMid);
    const back = new THREE.Mesh(mkPlane(W, H), backM); back.position.set(0, H / 2, ROOM.zBack);
    const behind = new THREE.Mesh(mkPlane(W, H), wallM); behind.rotation.y = Math.PI; behind.position.set(0, H / 2, ROOM.zBack + L);
    g.add(floor, ceil, lw, rw, back, behind);

    // molduras (cantos do corredor) na cor do tema
    const trimM = new THREE.MeshLambertMaterial({ color: th.trim });
    const glowM = new THREE.MeshBasicMaterial({ color: th.glow, toneMapped: false });
    const glow2M = new THREE.MeshBasicMaterial({ color: th.glow2, toneMapped: false });
    const edge = (x, y, m, s = 0.06) => { const e = new THREE.Mesh(new THREE.BoxGeometry(s, s, L), m); e.position.set(x, y, zMid); g.add(e); };
    if (th.name === 'fornalha') {
      // faixas de neon nos cantos e no meio das paredes
      for (const [x, y] of [[-ROOM.x, 0.02], [ROOM.x, 0.02], [-ROOM.x, H - 0.02], [ROOM.x, H - 0.02]]) edge(x, y, glowM, 0.035);
      for (const x of [-ROOM.x + 0.01, ROOM.x - 0.01]) edge(x, 1.0, glow2M, 0.02);
      // brasa embaixo da grade do chão
      const lava = new THREE.Mesh(mkPlane(W, L), new THREE.MeshBasicMaterial({ color: '#ff4a10', transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false }));
      lava.rotation.x = -Math.PI / 2; lava.position.set(0, 0.004, zMid); g.add(lava);
      g.userData.lava = lava;
      // anéis de neon que contornam o corredor
      for (let k = 0; k < 5; k++) {
        const z = ROOM.zBack + 0.6 + k * 1.6;
        const m = k % 2 ? glow2M : glowM;
        for (const [w, h, x, y] of [[0.03, H, -ROOM.x + 0.02, H / 2], [0.03, H, ROOM.x - 0.02, H / 2], [W, 0.03, 0, H - 0.02]]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), m); r.position.set(x, y, z); g.add(r);
        }
      }
    } else if (th.name === 'oficina') {
      for (const [x, y] of [[-ROOM.x, 0.03], [ROOM.x, 0.03], [-ROOM.x, H - 0.04], [ROOM.x, H - 0.04]]) edge(x, y, trimM, 0.1);
      // vigas no teto e lâmpadas penduradas
      for (let k = 0; k < 5; k++) {
        const z = ROOM.zBack + 0.8 + k * 1.7;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, 0.16), trimM); beam.position.set(0, H - 0.07, z); g.add(beam);
        const post = (x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 0.14), trimM); p.position.set(x, H / 2, z); g.add(p); };
        post(-ROOM.x + 0.06); post(ROOM.x - 0.06);
        if (k % 2 === 0 && z < -1.5) {
          const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.25), trimM); wire.position.set(0, H - 0.27, z); g.add(wire);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), glowM); bulb.position.set(0, H - 0.42, z); g.add(bulb);
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: th.glow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
          halo.scale.setScalar(0.7); halo.position.copy(bulb.position); g.add(halo);
        }
      }
      // prateleira com vasos de barro na parede atrás do jogador (para dar "oficina")
      const pot = new THREE.MeshLambertMaterial({ color: '#b8603a' });
      for (let k = 0; k < 4; k++) {
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.2, 12), pot);
        v.position.set(-0.8 + k * 0.55, 1.12, ROOM.zBack + L - 0.15); g.add(v);
      }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.25), trimM); shelf.position.set(0, 1.0, ROOM.zBack + L - 0.13); g.add(shelf);
    } else {
      for (const [x, y] of [[-ROOM.x, 0.03], [ROOM.x, 0.03], [-ROOM.x, H - 0.03], [ROOM.x, H - 0.03]]) edge(x, y, trimM, 0.08);
      // colunas do aquário e plantas
      for (let k = 0; k < 5; k++) {
        const z = ROOM.zBack + 0.8 + k * 1.7;
        for (const x of [-ROOM.x + 0.04, ROOM.x - 0.04]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.1), trimM); p.position.set(x, H / 2, z); g.add(p); }
      }
      const weed = new THREE.MeshLambertMaterial({ color: '#2a9a5a' });
      for (let k = 0; k < 10; k++) {
        const x = (k % 2 ? -1 : 1) * (ROOM.x - 0.15), z = ROOM.zBack + 0.4 + k * 0.8;
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 + (k % 3) * 0.2, 6), weed); s.position.set(x, 0.3, z); g.add(s);
      }
      // peixes passando do lado de fora do vidro (silhuetas)
      const fishG = new THREE.Group();
      const fishM = new THREE.MeshBasicMaterial({ color: '#0a3a48', transparent: true, opacity: 0.8 });
      const fishGeo = new THREE.ConeGeometry(0.08, 0.32, 4); fishGeo.rotateZ(Math.PI / 2);
      for (let k = 0; k < 10; k++) {
        const f = new THREE.Mesh(fishGeo, fishM);
        f.userData = { side: k % 2 ? -1 : 1, y: 0.6 + (k * 0.37) % 1.8, sp: 0.4 + (k % 4) * 0.15, ph: k * 1.7 };
        fishG.add(f);
      }
      g.add(fishG);
      g.userData.fish = fishG;
    }
    g.visible = false;
    scene.add(g);
    return g;
  });

  // ---------- letreiro do placar (em cima, na entrada do corredor) ----------
  const marquee = new THREE.Group();
  const frameM = new THREE.MeshLambertMaterial({ color: '#1a1420' });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, 0.36, 0.08), frameM);
  marquee.add(frame);
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024; boardCanvas.height = 128;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, 0.3), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  board.position.z = 0.041;
  marquee.add(board);
  // lâmpadas em volta do letreiro (piscam em sequência)
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), 34);
  for (let k = 0; k < 34; k++) {
    const m = new THREE.Matrix4();
    if (k < 15) m.setPosition(-W / 2 + 0.08 + k * (W - 0.16) / 14, 0.17, 0.05);
    else if (k < 30) m.setPosition(W / 2 - 0.08 - (k - 15) * (W - 0.16) / 14, -0.17, 0.05);
    else m.setPosition((k < 32 ? -1 : 1) * (W / 2 - 0.02), k % 2 ? 0.06 : -0.06, 0.05);
    bulbs.setMatrixAt(k, m);
    bulbs.setColorAt(k, new THREE.Color('#ffd25a'));
  }
  marquee.add(bulbs);
  marquee.position.set(0, ROOM.y1 - 0.2, -1.6);
  marquee.rotation.x = 0.12;
  scene.add(marquee);

  let cur = -1;
  const world = {
    scene, themes, marquee, board: { canvas: boardCanvas, tex: boardTex, last: '' }, bulbs, glowTex,
    setTheme(i) {
      if (i === cur) return;
      cur = i;
      const th = THEMES[i];
      themes.forEach((g, k) => { g.visible = k === i; });
      scene.background = new THREE.Color(th.bg);
      scene.fog.color.set(th.fog); scene.fog.near = th.fogNear; scene.fog.far = th.fogFar;
      hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
      sun.color.set(th.sun[0]); sun.intensity = th.sun[1];
      frameM.color.set(th.trim);
    },
    get theme() { return THEMES[cur]; },
    update(dt, time) {
      const g = themes[cur];
      if (g?.userData.fish) for (const f of g.userData.fish.children) {
        const d = f.userData;
        f.position.set(d.side * (ROOM.x + 0.3 + Math.sin(time + d.ph) * 0.1), d.y + Math.sin(time * 1.3 + d.ph) * 0.08, ROOM.zBack + ((time * d.sp + d.ph * 3) % 9));
        f.rotation.set(0, Math.PI / 2, Math.sin(time * 6 + d.ph) * 0.15);
      }
      if (g?.userData.lava) g.userData.lava.material.opacity = 0.2 + 0.08 * Math.sin(time * 1.7);
      // lâmpadas do letreiro em sequência
      const c = new THREE.Color();
      for (let k = 0; k < 34; k++) {
        const on = (Math.floor(time * 6) + k) % 3 === 0;
        c.set(on ? THEMES[cur].glow : '#3a2a1a');
        bulbs.setColorAt(k, c);
      }
      bulbs.instanceColor.needsUpdate = true;
    },
    // desenha o placar (só quando muda)
    setBoard(lines) {
      const key = JSON.stringify(lines);
      if (key === this.board.last) return;
      this.board.last = key;
      const g = boardCanvas.getContext('2d'), w = 1024, h = 128;
      g.fillStyle = '#0a0610'; g.fillRect(0, 0, w, h);
      // pontinhos de LED no fundo
      g.fillStyle = 'rgba(255,255,255,0.04)';
      for (let x = 4; x < w; x += 8) for (let y = 4; y < h; y += 8) g.fillRect(x, y, 3, 3);
      g.textBaseline = 'middle';
      for (const l of lines) {
        g.font = `bold ${l.size || 54}px monospace`;
        g.textAlign = l.align || 'left';
        g.fillStyle = l.color || '#ffd25a';
        g.shadowColor = l.color || '#ffd25a'; g.shadowBlur = 12;
        g.fillText(l.text, l.x, l.y ?? h / 2);
      }
      g.shadowBlur = 0;
      boardTex.needsUpdate = true;
    },
  };
  return world;
}

// ---------- tijolos ----------
const ICONS = ['m', 'x', 'a', 'b', 'f', 'r', 't', 'g', 's', 'd', 'crack1', 'crack2', 'ring', 'guard'];
export class BrickView {
  constructor(scene, cap = 260) {
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: brickFaceTexture() }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // ícones: uma InstancedMesh por tipo (plano colado na cara virada para o jogador)
    const pgeo = new THREE.PlaneGeometry(1, 1);
    this.icons = {};
    for (const k of ICONS) {
      const m = new THREE.InstancedMesh(pgeo, new THREE.MeshBasicMaterial({ map: iconTexture(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 60);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 2;
      scene.add(m);
      this.icons[k] = m;
    }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.c = new THREE.Color();
    this.flash = new Map();   // id -> tempo do brilho de batida
    this.palette = THEMES[0].bricks; this.hard = THEMES[0].hard;
  }
  setTheme(th) { this.palette = th.bricks; this.hard = th.hard; }
  hit(id) { this.flash.set(id, 0.18); }
  colorOf(b) {
    if (b.type === 'n') {
      const row = Math.round((GRID.top - GRID.rowH / 2 - b.c0[1]) / GRID.rowH);
      const k = b.wall === 'back' ? row : b.wall === 'top' ? Math.round((b.c0[2] - ROOM.zBack) / GRID.sideDepth) + 2 : row + 3;
      return this.palette[((k % this.palette.length) + this.palette.length) % this.palette.length];
    }
    if (b.type === 'd') return this.hard;
    return SPECIAL[b.type] || '#ffffff';
  }
  update(bricks, dt, time, hidden = new Set()) {
    let n = 0;
    const counts = {};
    for (const k of ICONS) counts[k] = 0;
    for (const [id, t] of this.flash) { if (t - dt <= 0) this.flash.delete(id); else this.flash.set(id, t - dt); }
    for (const b of bricks) {
      if (!b.alive || hidden.has(b.type) || n >= this.cap) continue;
      const pulse = this.flash.has(b.id) ? 1 + this.flash.get(b.id) * 0.6 : 1;
      this.s.set(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2).multiplyScalar(pulse);
      this.p.set(b.c[0], b.c[1], b.c[2]);
      this.q.identity();
      if (b.type === 'ring' || b.type === 'guard') this.q.setFromAxisAngle(this.p.clone().set(0, 1, 0), time * 0.5);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.c.set(this.colorOf(b));
      if (b.type === 'd') this.c.multiplyScalar(0.7 + 0.3 * b.hp / b.maxHp);
      if (b.type === 'm') this.c.lerp(new THREE.Color('#ffffff'), 0.15 + 0.15 * Math.sin(time * 6));
      if (this.flash.has(b.id)) this.c.lerp(new THREE.Color('#ffffff'), this.flash.get(b.id) * 4);
      this.mesh.setColorAt(n, this.c);
      n++;
      // ícone na cara virada para o jogador
      const ic = b.type === 'd' ? (b.hp >= 3 ? 'd' : b.hp === 2 ? 'crack1' : 'crack2') : this.icons[b.type] ? b.type : null;
      if (ic) {
        const M = this.icons[ic];
        const i = counts[ic]++;
        if (i >= 60) continue;
        if (b.wall === 'left' || b.wall === 'right') {
          const sx = b.wall === 'left' ? 1 : -1;
          this.p.set(b.c[0] + sx * (b.h[0] + 0.002), b.c[1], b.c[2]);
          this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx * Math.PI / 2);
          this.s.set(b.h[2] * 2 * 0.92, b.h[1] * 2 * 0.9, 1);
        } else if (b.wall === 'top') {
          this.p.set(b.c[0], b.c[1] - b.h[1] - 0.002, b.c[2]);
          this.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
          this.s.set(b.h[0] * 2 * 0.92, b.h[2] * 2 * 0.9, 1);
        } else {
          this.p.set(b.c[0], b.c[1], b.c[2] + b.h[2] * pulse + 0.002);
          this.q.identity();
          this.s.set(b.h[0] * 2 * 0.92 * pulse, b.h[1] * 2 * 0.9 * pulse, 1);
        }
        this.m.compose(this.p, this.q, this.s);
        M.setMatrixAt(i, this.m);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const k of ICONS) { const M = this.icons[k]; M.count = Math.min(60, counts[k]); M.instanceMatrix.needsUpdate = true; }
  }
}

// ---------- bolas ----------
export class BallView {
  constructor(scene, glowTex) {
    this.items = [];
    for (let i = 0; i < MAX_BALLS + 1; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: '#fff6e0', emissive: '#ffd8a0', emissiveIntensity: 0.55 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(BALL.r, 20, 14), mat);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffe0a0', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(BALL.r * 6);
      // sombra falsa no chão (ajuda a ver a profundidade)
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL.r * 1.3, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      g.add(s, halo);
      g.visible = false; shadow.visible = false;
      scene.add(g, shadow);
      this.items.push({ g, mat, halo, shadow });
    }
  }
  update(balls, fire, ahead, time) {
    this.items.forEach((it, i) => {
      const b = balls[i];
      it.g.visible = it.shadow.visible = !!b;
      if (!b) return;
      it.g.position.set(b.p[0] + b.v[0] * ahead, b.p[1] + b.v[1] * ahead, b.p[2] + b.v[2] * ahead);
      it.shadow.position.set(it.g.position.x, 0.006, it.g.position.z);
      const k = Math.max(0.3, 1 - it.g.position.y / 3);
      it.shadow.scale.setScalar(k * 1.4);
      it.shadow.material.opacity = 0.35 * k;
      const c = fire ? '#ff7a1a' : b.serve ? '#9af0ff' : '#ffd8a0';
      it.mat.emissive.set(c);
      it.mat.emissiveIntensity = fire ? 1.2 : 0.55 + (b.serve ? 0.3 * Math.sin(time * 8) : 0);
      it.halo.material.color.set(fire ? '#ff6a1a' : b.serve ? '#9af0ff' : '#ffe0a0');
      it.halo.scale.setScalar(BALL.r * (fire ? 9 : 6));
    });
  }
}

export class RockView {
  constructor(scene) {
    this.items = [];
    const mat = new THREE.MeshLambertMaterial({ color: '#7a5a48', flatShading: true });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(KING.rockR, 0), mat);
      m.visible = false;
      scene.add(m);
      this.items.push(m);
    }
  }
  update(rocks, ahead, time) {
    this.items.forEach((m, i) => {
      const r = rocks[i];
      m.visible = !!r;
      if (!r) return;
      m.position.set(r.p[0] + r.v[0] * ahead, r.p[1] + r.v[1] * ahead, r.p[2] + r.v[2] * ahead);
      m.rotation.set(time * 3 + i, time * 2, 0);
    });
  }
}

// ---------- raquete ----------
// Disco com aro e cabo. A cara (normal) é o -z local; o centro do disco é a origem do grupo.
export function buildPaddle(color) {
  const g = new THREE.Group();
  const face = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(PADDLE.r, PADDLE.r, 0.018, 32), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
  disc.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PADDLE.r, 0.012, 8, 40), new THREE.MeshLambertMaterial({ color: '#f4f0e8' }));
  // grade fininha para ver através (dá para enxergar a bola atrás da raquete)
  disc.material.transparent = true; disc.material.opacity = 0.55; disc.material.depthWrite = false;
  face.add(disc, rim);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.14, 10), new THREE.MeshLambertMaterial({ color: '#c89a6a' }));
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, -0.02, 0.15);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), handle.material);
  neck.position.set(0, -0.01, 0.07 + PADDLE.r - 0.16);
  g.add(face, handle, neck);
  return { group: g, face, disc, rim, setBig(k) { face.scale.set(k, k, 1); }, setColor(c) { disc.material.color.set(c); disc.material.emissive.set(c); } };
}

// ---------- chefes ----------
function faceTexture(kind) {
  return canvasTex(256, 256, (g, w, h) => {
    if (kind === 'core') {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#c060ff'); gr.addColorStop(1, '#5a1a8a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // polvo: olhos grandes e ventosas
      for (const x of [80, 176]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 90, 34, 40, 0, 0, 7); g.fill(); g.fillStyle = '#1a0a2a'; g.beginPath(); g.arc(x + 6, 98, 16, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,200,255,0.5)';
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(30 + (i % 6) * 40, 180 + Math.floor(i / 6) * 34, 10, 0, 7); g.fill(); }
    } else {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd04a'); gr.addColorStop(1, '#c86a1a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(80,30,0,0.5)'; g.lineWidth = 6;
      for (let y = 64; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      // cara brava do Rei
      g.fillStyle = '#2a0a00';
      g.beginPath(); g.moveTo(50, 92); g.lineTo(110, 112); g.lineTo(104, 128); g.lineTo(50, 112); g.fill();
      g.beginPath(); g.moveTo(206, 92); g.lineTo(146, 112); g.lineTo(152, 128); g.lineTo(206, 112); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(84, 140, 14, 0, 7); g.arc(172, 140, 14, 0, 7); g.fill();
      g.fillStyle = '#2a0a00'; g.fillRect(70, 190, 116, 20);
      g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) g.fillRect(74 + i * 19, 190, 12, 10);
    }
  });
}

export function buildCore() {
  const g = new THREE.Group();
  const tex = faceTexture('core');
  const side = new THREE.MeshLambertMaterial({ color: '#8a3ad0' });
  const front = new THREE.MeshLambertMaterial({ map: tex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.36, 0.44), [side, side, side, side, front, side]);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), side);
  head.position.y = 0.62; head.scale.y = 0.6; g.add(head);
  const tent = [];
  for (let k = 0; k < 8; k++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.6, 8), side);
    const a = k * Math.PI / 4;
    t.position.set(Math.cos(a) * 0.22, -0.62, Math.sin(a) * 0.22);
    g.add(t); tent.push({ t, a });
  }
  g.position.set(...TOTEM.c);
  return { group: g, body, mats: [side, front], tent };
}

export function buildKing() {
  const g = new THREE.Group();
  const tex = faceTexture('king');
  const side = new THREE.MeshLambertMaterial({ color: '#d88a2a' });
  const front = new THREE.MeshLambertMaterial({ map: tex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), [side, side, side, side, front, side]);
  g.add(body);
  const gold = new THREE.MeshLambertMaterial({ color: '#ffe04a', emissive: '#a07000', emissiveIntensity: 0.4 });
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.62), gold);
  band.position.y = 0.44; g.add(band);
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), gold);
    sp.position.set(-0.32 + k * 0.16, 0.57, 0.24); g.add(sp);
  }
  // escudo: brilho quando fechado (guardas em volta)
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(shield);
  return { group: g, body, mats: [side, front], shield };
}

// ---------- rede de energia atrás do jogador ----------
export function buildNet() {
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.strokeStyle = 'rgba(95,255,200,0.9)'; g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.y1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
  m.position.set(0, ROOM.y1 / 2, 0.16);
  m.visible = false;
  return m;
}

// ---------- partículas ----------
export class Particles {
  constructor(scene, cap = 1600) {
    this.cap = cap;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.s0 = new Float32Array(cap); this.grav = new Float32Array(cap);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute vec3 pcolor; attribute float size; attribute float alpha; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(128.0, size * uScale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 q = abs(gl_PointCoord - 0.5); if (max(q.x, q.y) > 0.5) discard; float a = vA * (1.0 - max(q.x, q.y) * 1.2); gl_FragColor = vec4(vC * a, a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 4) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.tmp.set(color);
    this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.life[i] = this.max[i] = life; this.s0[i] = size; this.size[i] = size; this.alpha[i] = 1; this.grav[i] = grav;
  }
  // estilhaços quadrados (pedaços de tijolo) que caem com gravidade
  burst(p, color, n, speed, life = 0.8, size = 0.04, grav = 4) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(p[0], p[1], p[2], Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, life * (0.5 + Math.random() * 0.6), size * (0.5 + Math.random()), color, grav);
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= this.grav[i] * dt;
      for (let j = 0; j < 3; j++) { this.v[i * 3 + j] *= 1 - 0.8 * dt; this.p[i * 3 + j] += this.v[i * 3 + j] * dt; }
      if (this.p[i * 3 + 1] < 0.01) { this.p[i * 3 + 1] = 0.01; this.v[i * 3 + 1] *= -0.3; }
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = Math.min(1, f * 2);
      this.size[i] = this.s0[i] * (0.5 + 0.5 * f);
    }
    for (const a of ['position', 'size', 'alpha', 'pcolor']) this.geo.attributes[a].needsUpdate = true;
  }
}
