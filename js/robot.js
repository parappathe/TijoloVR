// Robô jogador com limites humanos: as mãos andam no máximo 2,6 m/s e giram no máximo 8 rad/s,
// só alcançam a área na frente do corpo, reagem 0,25 s depois que a bola vira na direção dele,
// e erram um pouco a posição e o ângulo da raquete. Escolhe um tijolo, confere numa simulação
// se a bola chega nele e inclina a raquete para mandar a bola para lá.
// Usado pelos testes (calibra as estrelas) e pelo dev.autoplay. Sem navegador.
import { add, sub, mul, madd, dot, len, norm, cross, clamp, dist, angle, Rng } from './vec.js';
import { DT, BALL, PADDLE, ROOM, copyBall } from './sim.js';

export const HUMAN = {
  handSpeed: 2.6,       // m/s
  turnSpeed: 8,         // rad/s
  reaction: 0.3,        // s
  hitZ: -0.45,          // plano onde costuma bater
  reach: { x: 0.85, y0: 0.6, y1: 2.0, z0: -0.9, z1: 0 },
  swing: 1.1,           // m/s da batida
  aimJitter: 1.2 * Math.PI / 180,
  posJitter: 0.07,
  rest: [[-0.3, 1.2, -0.3], [0.3, 1.2, -0.3]],
};
const NOT_TARGET = new Set(['s']);

export function makeRobot(opts = {}) { return new Robot(opts); }

class Robot {
  constructor(opts) {
    this.h = { ...HUMAN, ...opts };
    this.rng = new Rng(opts.seed ?? 11);
    this.reset();
  }
  reset() {
    this.hands = this.h.rest.map(p => ({ p: p.slice(), n: [0, 0, -1], plan: null }));
    this.seenAt = new Map();     // bola/pedra -> instante em que começou a vir para cá
    this.replan = 0;
    this.misses = 0;
  }

  // Previsão: onde e quando a bola cruza o plano de batida (física livre, sem tijolos).
  predict(game, b) {
    const c = copyBall(b), step = 1 / 60;
    for (let t = 0; t < 4; t += step) {
      const z0 = c.p[2];
      game.freeStep(c, step);
      if (c.v[2] > 0 && z0 < this.h.hitZ && c.p[2] >= this.h.hitZ) {
        const f = (this.h.hitZ - z0) / (c.p[2] - z0 || 1);
        return { t: game.t + t + step * f, p: madd(c.p, c.v, -step * (1 - f)), v: c.v.slice() };
      }
    }
    return null;
  }

  // Direção de saída para uma normal de raquete (mesma conta do sim.js).
  outDir(vin, n, s) {
    const vp = mul(n, s), vrel = sub(vin, vp);
    const side = dot(vrel, n) < 0 ? 1 : -1, ns = mul(n, side);
    const relN = dot(vrel, ns);
    let out = add(madd(vrel, ns, -(1 + PADDLE.e) * relN), vp);
    return norm(out);
  }
  normalFor(vin, u, s) {
    let n = norm(sub(u, norm(vin)));
    for (let k = 0; k < 8; k++) n = norm(madd(n, sub(u, this.outDir(vin, n, s)), 0.8));
    return n;
  }

  // Simula a bola saindo de p na direção u e diz qual tijolo ela toca primeiro.
  firstBrick(game, p, u, speed) {
    const b = { p: p.slice(), v: mul(u, speed), curve: [0, 0, 0], serve: false, cool: [0, 0] };
    const step = 1 / 60;
    for (let t = 0; t < 3; t += step) {
      game.freeStep(b, step);
      if (b.v[2] > 0 && b.p[2] > -2) return null;   // voltou sem bater em nada
      const c = game.brickContact(b);
      if (c) return { brick: c.brick, t };
    }
    return null;
  }

  chooseAim(game, P, vin) {
    const s0 = game.speed, out = clamp(len(vin) * 0.85 + this.h.swing * 1.6, s0 * BALL.minFrac, BALL.vmax);
    const useless = (k) => NOT_TARGET.has(k.type) || (k.type === 'king' && !game.kingOpen);
    const alive = game.bricks.filter(k => k.alive && !useless(k));
    // chefes: mira no núcleo / no rei; se não der, em qualquer coisa no caminho
    const prefer = game.core?.alive && (game.boss !== 'king' || game.kingOpen) ? [game.core] : [];
    const cands = [...prefer, ...alive.filter(k => !prefer.includes(k)).sort((a, b) => angle(sub(a.c, P), [0, 0, -1]) - angle(sub(b.c, P), [0, 0, -1]))]
      .slice(0, 9);
    // um pouco de variedade: começa às vezes por um candidato diferente
    let best = null;
    for (const k of cands) {
      const lead = k.move || game.boss === 'totem' || game.boss === 'king' ? this.leadFor(game, k, P, out) : k.c;
      const u = norm(sub(lead, P));
      if (u[2] > -0.42) continue;
      const hit = this.firstBrick(game, P, u, out);
      if (!hit) continue;
      if (useless(hit.brick)) continue;
      const score = (hit.brick === k ? 0 : 0.6) + hit.t * 0.2 + (k === game.core ? -1 : 0) + this.rng.next() * 0.3;
      if (!best || score < best.score) best = { u, score, target: k };
    }
    if (!best) {
      // nada confere: manda reto para o fundo, um pouco para o lado onde há tijolos
      const tgt = alive[0]?.c || game.core?.c || [0, 1.4, ROOM.zBack];
      best = { u: norm(sub(tgt, P)), score: 9, target: null };
    }
    return best.u;
  }

  // posição futura de um tijolo que se move (andante, anel, Rei), olhando o tempo de voo
  leadFor(game, k, P, speed) {
    let c = k.c;
    for (let it = 0; it < 3; it++) c = game.posAt(k, game.t + dist(c, P) / speed);
    return c;
  }

  step(game) {
    const H = this.h, t = game.t;
    // o que está vindo para cá (bolas e pedras), depois do tempo de reação
    const coming = [];
    const live = new Set();
    for (const b of game.balls) {
      live.add(b.id);
      const toward = b.v[2] > 0;
      if (!toward) { this.seenAt.delete(b.id); continue; }
      if (!this.seenAt.has(b.id)) this.seenAt.set(b.id, t);
      if (t - this.seenAt.get(b.id) < H.reaction) continue;
      coming.push({ kind: 'ball', obj: b });
    }
    for (const r of game.rocks) {
      live.add(r.id);
      if (!this.seenAt.has(r.id)) this.seenAt.set(r.id, t);
      if (t - this.seenAt.get(r.id) < H.reaction) continue;
      coming.push({ kind: 'rock', obj: r });
    }
    for (const id of this.seenAt.keys()) if (!live.has(id)) this.seenAt.delete(id);

    // replaneja 10 vezes por segundo
    this.replan -= DT;
    if (this.replan <= 0) {
      this.replan = 0.1;
      const items = [];
      for (const c of coming) {
        let pr;
        if (c.kind === 'ball') pr = this.predict(game, c.obj);
        else {
          const r = c.obj, tt = (H.hitZ - r.p[2]) / r.v[2];
          pr = tt > 0 ? { t: t + tt, p: madd(r.p, r.v, tt), v: r.v.slice() } : null;
        }
        if (pr && pr.t > t) items.push({ ...c, pr });
      }
      items.sort((a, b) => a.pr.t - b.pr.t);
      const used = [false, false];
      for (const h of this.hands) h.next = null;
      for (const it of items) {
        // mão do lado da bola; se estiver ocupada, a outra
        const pref = it.pr.p[0] < 0 ? 0 : 1;
        const i = !used[pref] ? pref : !used[1 - pref] ? 1 - pref : -1;
        if (i < 0) break;
        used[i] = true;
        this.hands[i].next = it;
      }
      for (let i = 0; i < 2; i++) {
        const hand = this.hands[i], it = hand.next;
        if (!it) { hand.plan = null; continue; }
        const P = it.pr.p.slice();
        P[0] = clamp(P[0], -H.reach.x, H.reach.x);
        P[1] = clamp(P[1], H.reach.y0, H.reach.y1);
        const same = hand.plan && hand.plan.id === it.obj.id;
        let n, swing;
        if (it.kind === 'rock') { n = norm(mul(it.pr.v, -1)); swing = 0.6; }
        else {
          // a mira só é escolhida uma vez por batida (e refeita se a previsão mudou muito)
          if (same && hand.plan.aimAt && dist(hand.plan.aimAt, P) < 0.12) { n = hand.plan.n; }
          else {
            const u = this.chooseAim(game, P, it.pr.v);
            n = this.normalFor(it.pr.v, u, H.swing);
            // erro humano de ângulo
            const j1 = norm(cross(n, [0, 1, 0])), j2 = norm(cross(n, j1));
            n = norm(add(n, add(mul(j1, this.rng.range(-1, 1) * H.aimJitter), mul(j2, this.rng.range(-1, 1) * H.aimJitter))));
          }
          swing = H.swing;
        }
        const jit = same ? hand.plan.jit : [this.rng.range(-1, 1) * H.posJitter, this.rng.range(-1, 1) * H.posJitter, 0];
        hand.plan = { id: it.obj.id, tHit: it.pr.t, P, n, swing, jit, aimAt: P.slice() };
      }
    }

    // movimento das mãos com limite de velocidade e de giro
    const out = [];
    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i], pl = hand.plan;
      let tgtP, tgtN;
      if (pl) {
        const dtH = clamp(t - pl.tHit, -0.15, 0.08);
        tgtP = add(madd(pl.P, pl.n, pl.swing * dtH), pl.jit);
        tgtN = pl.n;
        if (t > pl.tHit + 0.15) hand.plan = null;
      } else { tgtP = H.rest[i]; tgtN = [0, 0, -1]; }
      tgtP = [clamp(tgtP[0], -H.reach.x - 0.1, H.reach.x + 0.1), clamp(tgtP[1], H.reach.y0 - 0.1, H.reach.y1 + 0.1), clamp(tgtP[2], H.reach.z0, H.reach.z1)];
      const d = sub(tgtP, hand.p), dl = len(d), mx = H.handSpeed * DT;
      hand.p = dl > mx ? madd(hand.p, d, mx / dl) : tgtP;
      const ang = angle(hand.n, tgtN), mr = H.turnSpeed * DT;
      hand.n = ang > mr ? norm(add(mul(hand.n, Math.sin(ang - mr)), mul(tgtN, Math.sin(mr)))) : tgtN.slice();
      let u = sub([0, 1, 0], mul(hand.n, hand.n[1]));
      u = len(u) > 1e-3 ? norm(u) : [0, 0, -1];
      out.push({ p: hand.p.slice(), n: hand.n.slice(), u, on: true });
    }
    return { hands: out };
  }
}
