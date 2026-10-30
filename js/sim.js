// Regras do Bate-Tijolo: corredor, bola com efeito, raquetes nas mãos, tijolos, poderes e chefes.
// Sem navegador e sem Three.js (os testes rodam no Node).
//
// Coordenadas em metros: o chão do jogador fica em y = 0 e ele está em z = 0, olhando para -z.
// O corredor vai de x = -1,3 a 1,3, do chão (y = 0) ao teto (y = 2,7), até a parede do fundo em
// z = -7. A bola que passa de z = 0,3 (atrás das mãos) está perdida.
import { add, sub, mul, madd, dot, len, norm, cross, clamp, dist, boxClosest, Rng } from './vec.js';
import { LEVELS, WORLDS, starsFor } from './levels.js';

export const DT = 1 / 120;
export const ROOM = { x: 1.3, y0: 0, y1: 2.7, zBack: -7, zLose: 0.3 };
export const BALL = {
  r: 0.07,
  vmax: 6.5,          // velocidade máxima (conforto no VR)
  minFrac: 0.9,       // nunca mais lenta que 90% da velocidade do mundo
  decay: 2.0,         // s para a força extra da batida ir sumindo
  fwd: 0.4,           // a bola sempre anda pelo menos 40% da velocidade no eixo do corredor
  curveMax: 1.5,      // m/s² de curva no máximo (efeito leve)
  curveTau: 0.7,      // s para o efeito sumir
  curveK: 0.22,       // quanto o giro do pulso (rad/s) vira curva
  serveSpeed: 1.6,    // saque: a bola vem devagar até você
};
export const PADDLE = { r: 0.16, big: 1.5, e: 0.8, cool: 0.12 };
// "Funil" de alcance: perto do jogador, a bola que volta é puxada de leve para a área que a mão
// alcança (não precisa andar pelo quarto).
export const REACH = { x: 0.6, y0: 0.85, y1: 1.85, z: -3.5, hitZ: -0.45, k: 4 };
export const LIVES = 3;
export const MAX_BALLS = 3;
export const POWER = { fire: 6, net: 20, slow: 8, big: 12 };
export const SLOW = 0.65;
export const LIFE_PENALTY = 15;
export const STUN = 1.0;

export const KIND = {
  n: { name: 'comum', hp: 1, score: 10 },
  d: { name: 'duro', hp: 3, score: 30 },
  s: { name: 'pedra', hp: Infinity, score: 0 },
  m: { name: 'ímã', hp: 1, score: 25 },
  x: { name: 'bola extra', hp: 1, score: 25 },
  a: { name: 'andante', hp: 1, score: 25 },
  b: { name: 'bomba', hp: 1, score: 25 },
  f: { name: 'fogo', hp: 1, score: 25 },
  r: { name: 'rede', hp: 1, score: 25 },
  t: { name: 'relógio', hp: 1, score: 25 },
  g: { name: 'raquetão', hp: 1, score: 25 },
  ring: { name: 'anel', hp: 1, score: 15 },
  core: { name: 'núcleo', hp: 10, score: 150 },
  guard: { name: 'guarda', hp: 1, score: 15 },
  king: { name: 'Rei Tijolo', hp: 6, score: 150 },
};
// tijolos que não precisam ser quebrados para vencer
const NOT_COUNTED = new Set(['s', 'ring', 'guard']);
const RESPAWN = { ring: 9, guard: 15 };

// Grade das paredes (ver legenda em levels.js)
export const GRID = {
  backCols: 6, sideCols: 7, rowH: 0.22, top: 2.6,
  cellW: 2 * ROOM.x / 6, sideDepth: 0.5, thick: 0.18, gap: 0.03,
};
const rowY = (k) => GRID.top - GRID.rowH / 2 - k * GRID.rowH;

export const MAGNET = { range: 3, pull: 3 };
export const WALL_BOSS = { speed: 0.06, push: 0.08, limit: -2.3, back: 2.5 };
export const TOTEM = { c: [0, 1.42, -4.5], R: 0.75, n: 12, ys: [0.95, 1.42, 1.89], spin: 0.5 };
export const KING = { z: -5.5, ax: 0.7, ay: 0.42, y: 1.45, orbit: 0.72, guards: 6, open: 3, spin: 0.8, rockEvery: 6, rockSpeed: 2.4, rockR: 0.12 };

function makeBrick(type, c, h, wall, extra = {}) {
  const K = KIND[type];
  return { id: 0, type, hp: K.hp, maxHp: K.hp, c: c.slice(), c0: c.slice(), h, wall, alive: true, move: null, respawnAt: -1, ...extra };
}

export function buildBricks(L) {
  const out = [];
  const { cellW, sideDepth, thick, gap, rowH } = GRID;
  const put = (ch, c, h, wall, axis) => {
    if (ch === '.' || ch === ' ') return;
    const b = makeBrick(ch, c, h, wall);
    if (ch === 'a') b.move = { axis, amp: 0.45, w: 1.4, ph: out.length * 0.9 };
    out.push(b);
  };
  (L.back || []).forEach((row, k) => [...row].forEach((ch, i) => put(ch,
    [-ROOM.x + cellW * (i + 0.5), rowY(k), ROOM.zBack + thick / 2], [cellW / 2 - gap, rowH / 2 - gap, thick / 2], 'back', 0)));
  for (const side of ['left', 'right']) {
    const sx = side === 'left' ? -1 : 1;
    (L[side] || []).forEach((row, k) => [...row].forEach((ch, i) => put(ch,
      [sx * (ROOM.x - thick / 2), rowY(k), ROOM.zBack + thick + sideDepth * (i + 0.5)], [thick / 2, rowH / 2 - gap, sideDepth / 2 - gap], side, 2)));
  }
  (L.top || []).forEach((row, k) => [...row].forEach((ch, i) => put(ch,
    [-ROOM.x + cellW * (i + 0.5), ROOM.y1 - thick / 2, ROOM.zBack + thick + sideDepth * (k + 0.5)], [cellW / 2 - gap, thick / 2, sideDepth / 2 - gap], 'top', 0)));
  if (L.boss === 'totem') {
    TOTEM.ys.forEach((y, ring) => {
      for (let k = 0; k < TOTEM.n; k++) out.push(makeBrick('ring', [0, y, 0], [0.13, 0.22, 0.12], 'boss', { ring, k }));
    });
    out.push(makeBrick('core', TOTEM.c, [0.22, 0.68, 0.22], 'boss'));
  } else if (L.boss === 'king') {
    out.push(makeBrick('king', [0, KING.y, KING.z], [0.4, 0.4, 0.3], 'boss'));
    for (let k = 0; k < KING.guards; k++) out.push(makeBrick('guard', [0, KING.y, KING.z], [0.13, 0.13, 0.13], 'boss', { k }));
  }
  out.forEach((b, i) => { b.id = i; });
  return out;
}

export function makeBall(p, v, extra = {}) {
  return { id: 0, p: p.slice(), v: v.slice(), curve: [0, 0, 0], serve: false, cool: [0, 0], ...extra };
}
export const copyBall = (b) => ({ ...b, p: b.p.slice(), v: b.v.slice(), curve: b.curve.slice(), cool: b.cool.slice() });

export class Game {
  constructor(level, opts = {}) {
    this.level = clamp(level, 0, LEVELS.length - 1);
    this.L = LEVELS[this.level];
    this.W = WORLDS[this.L.world];
    this.rng = new Rng(opts.seed ?? 7);
    this.bricks = buildBricks(this.L);
    this.total = this.bricks.filter(b => !NOT_COUNTED.has(b.type)).length;
    this.boss = this.L.boss || null;
    this.core = this.bricks.find(b => b.type === 'core' || b.type === 'king') || null;
    this.wallZ = 0;
    this.balls = [];
    this.rocks = [];
    this.nextId = 1;
    this.hands = [0, 1].map(() => ({ p: null, n: [0, 0, -1], u: [0, 1, 0], v: [0, 0, 0], w: [0, 0, 0], on: false }));
    this.lives = opts.lives ?? LIVES;
    this.livesLost = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.broken = 0;
    this.paddleHits = 0;
    this.power = { fire: 0, net: 0, slow: 0, big: 0 };
    this.stunned = 0;
    this.t = 0;
    this.phase = 'play';     // 'play' | 'won' | 'lost'
    this.serveT = opts.serveDelay ?? 1.5;   // saque daqui a tantos segundos
    this.rockT = KING.rockEvery;
    this.result = null;
    this.events = [];
    this.updateBricks();
  }

  get over() { return this.phase === 'won' || this.phase === 'lost'; }
  get speed() { return this.W.speed * (this.power.slow > 0 ? SLOW : 1); }
  get paddleR() { return PADDLE.r * (this.power.big > 0 ? PADDLE.big : 1); }
  get left() { return this.boss && this.boss !== 'wall' ? (this.core.alive ? this.core.hp : 0) : this.bricks.filter(b => b.alive && !NOT_COUNTED.has(b.type)).length; }
  emit(e) { this.events.push(e); }

  serve() {
    const b = makeBall([0, 1.35, -1.9], [0, 0, BALL.serveSpeed], { serve: true, id: this.nextId++ });
    this.balls.push(b);
    this.emit({ type: 'serve', p: b.p.slice() });
  }

  // ---------- passo ----------
  // input: { hands: [{ p, n, u, on, push? }, { ... }] } (posição e orientação da raquete de cada mão)
  step(input) {
    this.events = [];
    if (this.over) { this.t += DT; return; }
    this.t += DT;
    this.updateHands(input?.hands || []);
    for (const k in this.power) {
      if (this.power[k] > 0) { this.power[k] -= DT; if (this.power[k] <= 0) { this.power[k] = 0; this.emit({ type: 'power-end', kind: k }); } }
    }
    if (this.stunned > 0) this.stunned -= DT;
    this.updateBricks();
    if (this.boss === 'king') this.updateRocks();

    if (this.serveT > 0 && this.balls.length === 0) {
      this.serveT -= DT;
      if (this.serveT <= 0) this.serve();
    }
    for (const b of this.balls.slice()) this.stepBall(b);
    this.checkEnd();
  }

  updateHands(list) {
    for (let i = 0; i < 2; i++) {
      const H = this.hands[i], inp = list[i];
      H.prevP = H.p; H.prevN = H.n;
      if (!inp || !inp.on || !inp.p) { H.on = false; H.p = null; H.v = [0, 0, 0]; H.w = [0, 0, 0]; continue; }
      const n = norm(inp.n), u = norm(inp.u || [0, 1, 0]);
      if (H.on && H.prevP) {
        const raw = mul(sub(inp.p, H.prevP), 1 / DT);
        H.v = add(mul(H.v, 0.5), mul(raw, 0.5));
        const wr = mul(add(cross(H.n, n), cross(H.u, u)), 0.5 / DT);
        H.w = add(mul(H.w, 0.6), mul(wr, 0.4));
      } else { H.v = [0, 0, 0]; H.w = [0, 0, 0]; H.prevP = inp.p.slice(); H.prevN = n; }
      // PC: o mouse só anda num plano; a velocidade dele vira um empurrão para a frente (força)
      if (inp.push) H.v = madd(H.v, n, inp.push);
      H.p = inp.p.slice(); H.n = n; H.u = u; H.on = true;
    }
  }

  // Onde o tijolo está no instante t (andantes, Muralha, anéis do totem, Rei e guardas).
  // Puro: o robô usa para mirar onde o tijolo vai estar.
  posAt(b, t) {
    let c = b.c0.slice();
    if (b.move) c[b.move.axis] += b.move.amp * Math.sin(t * b.move.w + b.move.ph);
    if (this.boss === 'wall') c[2] += this.wallZ;
    else if (b.type === 'ring') {
      const a = (b.k / TOTEM.n) * Math.PI * 2 + t * TOTEM.spin * (b.ring === 1 ? -1 : 1);
      c = [TOTEM.c[0] + TOTEM.R * Math.sin(a), TOTEM.ys[b.ring], TOTEM.c[2] + TOTEM.R * Math.cos(a)];
    } else if (b.type === 'king' || b.type === 'guard') {
      const K = [KING.ax * Math.sin(t * 0.5), KING.y + KING.ay * Math.sin(t * 0.37), KING.z];
      if (b.type === 'king') return K;
      const a = (b.k / KING.guards) * Math.PI * 2 + t * KING.spin;
      c = [K[0] + KING.orbit * Math.cos(a), K[1] + KING.orbit * Math.sin(a), KING.z + 0.2];
    }
    return c;
  }

  updateBricks() {
    const t = this.t;
    for (const b of this.bricks) {
      if (!b.alive && b.respawnAt > 0 && t >= b.respawnAt) { b.alive = true; b.hp = b.maxHp; b.respawnAt = -1; this.emit({ type: 'respawn', id: b.id, p: b.c.slice() }); }
      if (b.move || this.boss) b.c = this.posAt(b, t);
    }
    if (this.boss === 'wall') {
      this.wallZ += WALL_BOSS.speed * DT;
      let front = -Infinity;
      for (const b of this.bricks) if (b.alive) front = Math.max(front, b.c[2] + b.h[2]);
      if (front > WALL_BOSS.limit) {
        this.wallZ = Math.max(0, this.wallZ - (front - WALL_BOSS.limit) - WALL_BOSS.back);
        this.emit({ type: 'wall-crash', p: [0, 1.4, front] });
        this.loseLife();
      }
    }
  }

  updateRocks() {
    if (this.core.alive) {
      this.rockT -= DT;
      if (this.rockT <= 0) {
        this.rockT = KING.rockEvery;
        const o = add(this.core.c, [0, 0, 0.35]);
        const tgt = [this.rng.range(-REACH.x, REACH.x), this.rng.range(REACH.y0 + 0.1, REACH.y1 - 0.1), 0];
        this.rocks.push({ id: this.nextId++, p: o, v: mul(norm(sub(tgt, o)), KING.rockSpeed), r: KING.rockR });
        this.emit({ type: 'rock-throw', p: o });
      }
    }
    for (const R of this.rocks.slice()) {
      R.p = madd(R.p, R.v, DT);
      let smashed = false;
      if (this.stunned <= 0) for (const H of this.hands) {
        if (!H.on) continue;
        const d = sub(R.p, H.p), dn = dot(d, H.n);
        const lat = len(madd(d, H.n, -dn));
        if (Math.abs(dn) < R.r + 0.05 && lat < this.paddleR + R.r) { smashed = true; break; }
      }
      if (smashed) {
        this.rocks.splice(this.rocks.indexOf(R), 1);
        this.score += 50;
        this.emit({ type: 'rock-smash', p: R.p.slice() });
      } else if (R.p[2] > ROOM.zLose) {
        this.rocks.splice(this.rocks.indexOf(R), 1);
        this.stunned = STUN;
        this.score = Math.max(0, this.score - 200);
        this.emit({ type: 'rock-hit', p: R.p.slice() });
      }
    }
  }

  // ---------- bola ----------
  // Física livre (paredes, efeito, ímãs, funil e controle de velocidade), sem tijolos nem raquetes.
  // Pura: o robô usa numa cópia da bola para prever o caminho. Devolve se bateu em alguma parede.
  freeStep(b, dt = DT) {
    let a = [0, 0, 0];
    // efeito: curva perpendicular ao movimento, sumindo aos poucos
    const sp0 = len(b.v) || 1, dir = mul(b.v, 1 / sp0);
    b.curve = madd(b.curve, dir, -dot(b.curve, dir));
    b.curve = mul(b.curve, Math.exp(-dt / BALL.curveTau));
    a = add(a, b.curve);
    if (!b.serve) {
      for (const m of this.bricks) {
        if (m.type !== 'm' || !m.alive) continue;
        const d = sub(m.c, b.p), r = len(d);
        if (r < MAGNET.range && r > 0.05) a = madd(a, d, MAGNET.pull * (1 - r / MAGNET.range) / r);
      }
      if (b.v[2] > 0 && b.p[2] > REACH.z) {
        // funil: perto do jogador, corrige de leve o rumo para a bola chegar onde a mão alcança
        const T = (REACH.hitZ - b.p[2]) / b.v[2];
        if (T > 0.12) {
          const ax = [b.p[0] + b.v[0] * T, b.p[1] + b.v[1] * T];
          const tx = clamp(ax[0], -REACH.x, REACH.x), ty = clamp(ax[1], REACH.y0, REACH.y1);
          if (tx !== ax[0]) a[0] += REACH.k * ((tx - b.p[0]) / T - b.v[0]);
          if (ty !== ax[1]) a[1] += REACH.k * ((ty - b.p[1]) / T - b.v[1]);
        }
      }
    }
    b.v = madd(b.v, a, dt);
    if (!b.serve) {
      // velocidade: a força extra some aos poucos; nunca abaixo do mínimo nem acima do máximo
      const s0 = this.speed;
      let sp = len(b.v);
      if (sp > s0) sp = s0 + (sp - s0) * Math.exp(-dt / BALL.decay);
      sp = clamp(sp, s0 * BALL.minFrac, BALL.vmax);
      b.v = mul(norm(b.v), sp);
      // não deixa a bola ficar indo e voltando de lado sem avançar
      if (Math.abs(b.v[2]) < BALL.fwd * sp) {
        const sz = b.v[2] >= 0 ? 1 : -1;
        const lat = Math.hypot(b.v[0], b.v[1]) || 1, want = Math.sqrt(1 - BALL.fwd * BALL.fwd) * sp;
        b.v = [b.v[0] * want / lat, b.v[1] * want / lat, sz * BALL.fwd * sp];
      }
    }
    b.p = madd(b.p, b.v, dt);
    // paredes do corredor
    const r = BALL.r;
    let wall = false;
    if (b.p[0] > ROOM.x - r) { b.p[0] = ROOM.x - r; b.v[0] = -Math.abs(b.v[0]); wall = true; }
    if (b.p[0] < -ROOM.x + r) { b.p[0] = -ROOM.x + r; b.v[0] = Math.abs(b.v[0]); wall = true; }
    if (b.p[1] > ROOM.y1 - r) { b.p[1] = ROOM.y1 - r; b.v[1] = -Math.abs(b.v[1]); wall = true; }
    if (b.p[1] < ROOM.y0 + r) { b.p[1] = ROOM.y0 + r; b.v[1] = Math.abs(b.v[1]); wall = true; }
    if (b.p[2] < ROOM.zBack + r) { b.p[2] = ROOM.zBack + r; b.v[2] = Math.abs(b.v[2]); wall = true; }
    if (wall) b.curve = mul(b.curve, 0.5);
    return wall;
  }

  // Primeiro tijolo vivo que a bola encosta (o mais fundo), com a normal do toque.
  brickContact(b) {
    let best = null, bestPen = 0;
    for (const k of this.bricks) {
      if (!k.alive) continue;
      const q = boxClosest(b.p, k.c, k.h), d = sub(b.p, q), dl = len(d);
      if (dl >= BALL.r) continue;
      let n;
      if (dl > 1e-6) n = mul(d, 1 / dl);
      else {
        // centro dentro da caixa: sai pela face mais perto
        const rel = sub(b.p, k.c);
        let ax = 0, m = Infinity;
        for (let i = 0; i < 3; i++) { const gapI = k.h[i] - Math.abs(rel[i]); if (gapI < m) { m = gapI; ax = i; } }
        n = [0, 0, 0]; n[ax] = rel[ax] >= 0 ? 1 : -1;
      }
      const pen = BALL.r - dl;
      if (!best || pen > bestPen) { best = { brick: k, n, q }; bestPen = pen; }
    }
    return best;
  }

  stepBall(b) {
    const prev = b.p.slice();
    if (this.freeStep(b)) this.emit({ type: 'wall', p: b.p.slice(), id: b.id });
    b.cool[0] -= DT; b.cool[1] -= DT;
    // rede de energia atrás do jogador
    if (this.power.net > 0 && b.v[2] > 0 && b.p[2] > 0.12 && !b.serve) {
      b.v[2] = -Math.abs(b.v[2]);
      this.power.net = 0;
      this.emit({ type: 'net-save', p: b.p.slice() });
    }
    // tijolos
    const hit = this.brickContact(b);
    if (hit) {
      const k = hit.brick;
      const fire = this.power.fire > 0 && k.type !== 's';
      if (!fire && dot(b.v, hit.n) < 0) {
        b.v = madd(b.v, hit.n, -2 * dot(b.v, hit.n));
        b.p = madd(hit.q, hit.n, BALL.r + 0.002);
      }
      if (!fire || !b.fireHit?.has(k.id)) this.damage(k, fire ? 3 : 1, b);
      if (fire) (b.fireHit ||= new Set()).add(k.id);
    } else if (b.fireHit) b.fireHit = null;
    // raquetes
    if (this.stunned <= 0) for (let i = 0; i < 2; i++) if (b.cool[i] <= 0 && this.paddleHit(b, prev, i)) break;
    // perdeu?
    if (b.p[2] > ROOM.zLose) {
      this.balls.splice(this.balls.indexOf(b), 1);
      if (b.serve) { this.emit({ type: 'reserve' }); if (!this.balls.length) this.serveT = 0.8; return; }
      if (this.balls.length === 0) this.loseLife();
      else this.emit({ type: 'ball-gone', p: b.p.slice() });
    }
  }

  loseLife() {
    this.lives--; this.livesLost++;
    this.combo = 0;
    this.emit({ type: 'lost-ball', lives: this.lives });
    if (this.lives <= 0) { this.finish(false); return; }
    if (this.balls.length === 0) this.serveT = 1.5;
  }

  paddleHit(b, prev, i) {
    const H = this.hands[i];
    if (!H.on || !H.prevP) return false;
    const R = this.paddleR;
    const n0 = H.prevN || H.n;
    const dPrev = dot(sub(prev, H.prevP), n0), dNow = dot(sub(b.p, H.p), H.n);
    const crossed = (dPrev > 0) !== (dNow > 0);
    if (!crossed && Math.abs(dNow) >= BALL.r) return false;
    const f = crossed ? dPrev / (dPrev - dNow) : 1;
    const bp = madd(prev, sub(b.p, prev), f), pp = madd(H.prevP, sub(H.p, H.prevP), f);
    let off = sub(bp, pp);
    off = madd(off, H.n, -dot(off, H.n));
    if (len(off) > R + BALL.r * 0.5) return false;
    const side = crossed ? (dPrev > 0 ? 1 : -1) : (dNow > 0 ? 1 : -1);
    const ns = mul(H.n, side);
    const vrel = sub(b.v, H.v), relN = dot(vrel, ns);
    if (relN >= 0) return false;
    let out = add(madd(vrel, ns, -(1 + PADDLE.e) * relN), H.v);
    // força: a batida mais rápida manda a bola mais rápido (até o limite)
    const s0 = this.W.speed * (this.power.slow > 0 ? SLOW : 1);
    let sp = clamp(len(out), s0 * BALL.minFrac, BALL.vmax);
    out = mul(norm(out), sp);
    // sempre para o fundo do corredor
    if (out[2] > -BALL.fwd * sp) {
      const lat = Math.hypot(out[0], out[1]), want = Math.sqrt(1 - BALL.fwd * BALL.fwd) * sp;
      const k = lat > want ? want / lat : 1;
      out = [out[0] * k, out[1] * k, -Math.sqrt(Math.max(0, sp * sp - (out[0] * k) ** 2 - (out[1] * k) ** 2))];
    }
    b.v = out;
    b.p = madd(pp, ns, BALL.r + 0.003);
    b.p = add(b.p, off);
    // efeito: giro do pulso em volta da direção da bola (e torção para os lados/cima) vira curva
    const u = norm(out);
    let right = cross(u, [0, 1, 0]);
    right = len(right) > 1e-3 ? norm(right) : [1, 0, 0];
    const up = cross(right, u);
    const roll = dot(H.w, u), yaw = dot(H.w, [0, 1, 0]), pitch = dot(H.w, right);
    let c = add(mul(right, BALL.curveK * (roll - yaw)), mul(up, BALL.curveK * pitch));
    const cl = len(c);
    if (cl > BALL.curveMax) c = mul(c, BALL.curveMax / cl);
    b.curve = c;
    b.serve = false;
    b.cool[i] = PADDLE.cool;
    b.cool[1 - i] = Math.max(b.cool[1 - i], PADDLE.cool * 0.5);
    this.combo = 0;
    this.paddleHits++;
    const swing = Math.max(0, -dot(H.v, ns));
    this.emit({ type: 'paddle', hand: i, p: b.p.slice(), swing, speed: sp, curve: len(c), id: b.id });
    return true;
  }

  // o Rei só leva dano com pelo menos KING.open guardas quebrados
  get kingOpen() { return this.boss === 'king' && this.bricks.filter(b => b.type === 'guard' && !b.alive).length >= KING.open; }

  damage(k, dmg, ball) {
    if (k.type === 's' || (k.type === 'king' && !this.kingOpen)) { this.emit({ type: 'ping', p: k.c.slice(), id: k.id }); return; }
    k.hp -= dmg;
    if (k.hp > 0) { this.emit({ type: 'crack', p: k.c.slice(), id: k.id, kind: k.type, hp: k.hp }); return; }
    this.breakBrick(k, ball);
  }

  breakBrick(k, ball) {
    k.alive = false;
    k.hp = 0;
    if (RESPAWN[k.type] && this.core?.alive) k.respawnAt = this.t + RESPAWN[k.type];
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = 1 + 0.5 * (this.combo - 1);
    const pts = Math.round(KIND[k.type].score * mult);
    this.score += pts;
    if (!NOT_COUNTED.has(k.type)) this.broken++;
    this.emit({ type: 'break', p: k.c.slice(), id: k.id, kind: k.type, combo: this.combo, pts });
    if (this.boss === 'wall') this.wallZ = Math.max(0, this.wallZ - WALL_BOSS.push);
    switch (k.type) {
      case 'x':
        if (this.balls.length < MAX_BALLS) {
          const nb = makeBall(add(k.c, [0, 0, k.h[2] + BALL.r + 0.05]), mul(norm([this.rng.range(-0.3, 0.3), this.rng.range(-0.2, 0.2), 1]), this.speed), { id: this.nextId++ });
          this.balls.push(nb);
          this.emit({ type: 'extra-ball', p: nb.p.slice() });
        }
        break;
      case 'b':
        this.emit({ type: 'bomb', p: k.c.slice() });
        for (const o of this.bricks) if (o.alive && o.type !== 's' && o.type !== 'core' && o.type !== 'king' && dist(o.c, k.c) < 0.62) this.breakBrick(o, ball);
        break;
      case 'f': this.power.fire = POWER.fire; this.emit({ type: 'power', kind: 'fire' }); break;
      case 'r': this.power.net = POWER.net; this.emit({ type: 'power', kind: 'net' }); break;
      case 't':
        if (this.power.slow <= 0) for (const o of this.balls) o.v = mul(o.v, SLOW);
        this.power.slow = POWER.slow; this.emit({ type: 'power', kind: 'slow' }); break;
      case 'g': this.power.big = POWER.big; this.emit({ type: 'power', kind: 'big' }); break;
      case 'core': case 'king':
        this.emit({ type: 'boss-down', p: k.c.slice(), kind: this.boss });
        for (const o of this.bricks) if (o.alive && (o.type === 'ring' || o.type === 'guard')) { o.alive = false; o.respawnAt = -1; this.emit({ type: 'break', p: o.c.slice(), id: o.id, kind: o.type, combo: 0, pts: 0 }); }
        for (const o of this.bricks) o.respawnAt = -1;
        this.rocks = [];
        break;
    }
  }

  checkEnd() {
    if (this.over) return;
    if (this.left === 0) this.finish(true);
  }

  finish(won) {
    this.phase = won ? 'won' : 'lost';
    const eff = this.t + LIFE_PENALTY * this.livesLost;
    let bonus = 0;
    if (won) {
      bonus = this.lives * 300 + Math.max(0, Math.round((this.L.par[1] * 1.3 - this.t) * 5));
      this.score += bonus;
    }
    this.result = {
      won, time: +this.t.toFixed(1), eff: +eff.toFixed(1), livesLost: this.livesLost, lives: this.lives,
      score: this.score, bonus, stars: won ? starsFor(this.level, eff) : 0, bestCombo: this.bestCombo,
    };
    this.balls = [];
    this.rocks = [];
    this.emit({ type: won ? 'won' : 'lost' });
  }
}

export { LEVELS, WORLDS };
