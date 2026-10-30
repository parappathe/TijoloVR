// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem usam navegador.
import { norm, len, sub, dot, reflect, boxClosest, dirFrom, azElOf } from '../js/vec.js';
import { Game, DT, ROOM, BALL, PADDLE, REACH, KIND, LIVES, MAX_BALLS, POWER, SLOW, TOTEM, KING, WALL_BOSS, makeBall, buildBricks } from '../js/sim.js';
import { LEVELS, WORLDS, LEVELS_PER_WORLD, starsFor } from '../js/levels.js';
import { makeRobot } from '../js/robot.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}
const near = (a, b, e) => Math.abs(a - b) <= e;
const off = { hands: [{ on: false }, { on: false }] };
// jogo sem saque automático e sem tijolos (para montar cenas)
function empty(level = 0, opts = {}) {
  const g = new Game(level, { serveDelay: 1e9, ...opts });
  g.bricks = []; g.total = 0;
  g.checkEnd = () => {};
  return g;
}
const run = (g, sec, inp = off) => { const evs = []; for (let i = 0; i < Math.round(sec / DT); i++) { g.step(typeof inp === 'function' ? inp(g) : inp); evs.push(...g.events); } return evs; };
const ball = (g, p, v, extra) => { const b = makeBall(p, v, { id: g.nextId++, ...extra }); g.balls.push(b); return b; };
const brick = (g, type, c, h = [0.2, 0.1, 0.09]) => {
  const b = { id: 900 + g.bricks.length, type, hp: KIND[type].hp, maxHp: KIND[type].hp, c: c.slice(), c0: c.slice(), h, wall: 'back', alive: true, move: null, respawnAt: -1 };
  g.bricks.push(b); return b;
};
const paddle = (p, n = [0, 0, -1], u = [0, 1, 0]) => ({ p, n, u, on: true });

console.log('Vetores');
{
  for (const [az, el] of [[0, 0], [90, 10], [-135, -60]]) {
    const r = azElOf(dirFrom(az, el));
    ok(near(r.az, az, 1e-6) && near(r.el, el, 1e-6), `azimute/elevação ida e volta (${az}, ${el})`);
  }
  const r = reflect([1, -1, 0], [0, 1, 0]);
  ok(near(r[0], 1, 1e-9) && near(r[1], 1, 1e-9), 'reflexão');
  const q = boxClosest([2, 0, 0], [0, 0, 0], [1, 1, 1]);
  ok(q[0] === 1 && q[1] === 0, 'ponto mais perto da caixa');
}

console.log('Fases');
{
  ok(LEVELS.length === 12 && WORLDS.length === 3, '12 fases em 3 mundos');
  LEVELS.forEach((L, i) => {
    ok(L.world === Math.floor(i / LEVELS_PER_WORLD), `fase ${i + 1} no mundo certo`);
    ok(!!L.boss === (i % 4 === 3), `fase ${i + 1}: chefe só na 4ª de cada mundo`);
    ok(L.par[0] < L.par[1], `fase ${i + 1}: limites de estrelas em ordem`);
    for (const w of ['back', 'left', 'right', 'top']) for (const row of L[w] || []) {
      ok(row.length === (w === 'left' || w === 'right' ? 7 : 6), `fase ${i + 1}: linha "${row}" da parede ${w} com o tamanho certo`);
      ok([...row].every(ch => ch === '.' || KIND[ch]), `fase ${i + 1}: só tijolos da legenda em "${row}"`);
    }
    ok((L.back || []).length <= 11 && (L.top || []).length <= 7, `fase ${i + 1}: cabe nas paredes`);
    const bs = buildBricks(L);
    // nenhum tijolo fora do corredor nem encavalado
    ok(bs.every(b => b.wall === 'boss' || (Math.abs(b.c[0]) + b.h[0] <= ROOM.x + 1e-6 && b.c[1] - b.h[1] >= 0 && b.c[1] + b.h[1] <= ROOM.y1 + 1e-6 && b.c[2] - b.h[2] >= ROOM.zBack - 1e-6)), `fase ${i + 1}: tijolos dentro do corredor`);
    ok(new Game(i).total > 0, `fase ${i + 1}: tem o que quebrar`);
  });
  ok(starsFor(0, 1) === 3 && starsFor(0, LEVELS[0].par[0] + 1) === 2 && starsFor(0, 9999) === 1, 'estrelas pelo tempo');
}

console.log('Bola e paredes');
{
  const g = empty();
  const b = ball(g, [1.0, 1.4, -5], [3, 0, -2]);
  const evs = run(g, 0.4);
  ok(evs.some(e => e.type === 'wall') && b.v[0] < 0, 'bate na parede do lado e volta');
  ok(Math.abs(b.p[0]) <= ROOM.x - BALL.r + 1e-9, 'não atravessa a parede');
  const b2 = ball(g, [0, 1.4, -6.6], [0, 0, -4]);
  run(g, 0.3);
  ok(b2.v[2] > 0, 'bate na parede do fundo e volta');
  // velocidade sempre dentro dos limites
  const g2 = empty();
  const b3 = ball(g2, [0, 1.4, -4], [0, 0, -20]);
  run(g2, 0.05);
  ok(len(b3.v) <= BALL.vmax + 1e-6, `nunca passa da velocidade máxima (${len(b3.v).toFixed(2)})`);
  const b4 = ball(g2, [0, 1.4, -4], [0, 0, -0.5]);
  run(g2, 0.05);
  ok(len(b4.v) >= g2.W.speed * BALL.minFrac - 1e-6, 'nunca fica lenta demais');
  // força extra vai sumindo
  const b5 = ball(g2, [0, 1.4, -2], [0, 0, -BALL.vmax]);
  run(g2, 4);
  ok(len(b5.v) < BALL.vmax - 1, `a força da batida some aos poucos (${len(b5.v).toFixed(2)})`);
  // não fica indo de um lado para o outro
  const b6 = ball(empty(), [0, 1.4, -4], [4, 0, -0.01]);
  const g3 = empty(); g3.balls.push(b6); run(g3, 0.05);
  ok(Math.abs(b6.v[2]) >= BALL.fwd * len(b6.v) - 1e-6, 'sempre avança pelo corredor');
}

console.log('Funil de alcance');
{
  for (const [x, y] of [[1.2, 2.6], [-1.2, 0.1], [0, 2.6], [1.2, 1.4]]) {
    const g = empty();
    const b = ball(g, [0, 1.4, -6.5], norm([x / 6, (y - 1.4) / 6, 1]).map(v => v * 4));
    let at = null;
    for (let i = 0; i < 400 && !at; i++) { const z0 = b.p[2]; g.step(off); if (z0 < REACH.hitZ && b.p[2] >= REACH.hitZ) at = b.p.slice(); }
    ok(at && Math.abs(at[0]) < REACH.x + 0.12 && at[1] > REACH.y0 - 0.12 && at[1] < REACH.y1 + 0.12, `bola mirada para (${x}, ${y}) chega ao alcance da mão (${at?.map(v => v.toFixed(2))})`);
  }
}

console.log('Raquete');
{
  // raquete parada: rebate para o fundo
  const g = empty();
  const b = ball(g, [0, 1.4, -1.2], [0, 0, 4]);
  const evs = run(g, 0.5, { hands: [{ on: false }, paddle([0, 1.4, -0.45])] });
  ok(evs.some(e => e.type === 'paddle' && e.hand === 1), 'raquete parada rebate');
  ok(b.v[2] < 0, 'bola volta para o fundo');
  // batida rápida manda mais rápido
  const speedAfter = (swing) => {
    const g = empty();
    const b = ball(g, [0, 1.4, -1.0], [0, 0, 4]);
    let z = -0.2;
    for (let i = 0; i < 80; i++) {
      z -= swing * DT;
      g.step({ hands: [paddle([0, 1.4, z]), { on: false }] });
      if (g.events.some(e => e.type === 'paddle')) return len(b.v);
    }
    return 0;
  };
  const slow = speedAfter(0), fast = speedAfter(2.5);
  ok(fast > slow + 0.8, `batida rápida manda a bola mais rápido (${slow.toFixed(2)} -> ${fast.toFixed(2)})`);
  ok(fast <= BALL.vmax + 1e-6, 'mesmo batendo forte, respeita o limite');
  // ângulo da raquete muda a direção
  const g2 = empty();
  const b2 = ball(g2, [0, 1.4, -1.2], [0, 0, 4]);
  run(g2, 0.5, { hands: [paddle([0, 1.4, -0.45], norm([0.4, 0, -1])), { on: false }] });
  ok(b2.v[0] > 0.8, `raquete inclinada para a direita manda para a direita (vx ${b2.v[0].toFixed(2)})`);
  // raquete inclinada demais ainda manda para frente
  const g3 = empty();
  const b3 = ball(g3, [0, 1.4, -1.2], [0, 0, 4]);
  run(g3, 0.5, { hands: [paddle([0, 1.4, -0.45], norm([1, 0, -0.15])), { on: false }] });
  ok(b3.v[2] <= -BALL.fwd * len(b3.v) + 1e-6, 'nunca rebate para trás');
  // fora da raquete não rebate
  const g4 = empty();
  ball(g4, [0, 1.4, -1.2], [0, 0, 4]);
  const ev4 = run(g4, 0.5, { hands: [paddle([0.5, 1.4, -0.45]), { on: false }] });
  ok(!ev4.some(e => e.type === 'paddle'), 'bola longe da raquete passa');
  // girar o pulso dá efeito: curva para o lado
  const g5 = empty();
  const b5 = ball(g5, [0, 1.4, -1.0], [0, 0, 4]);
  let ang = 0, curved = null;
  for (let i = 0; i < 120; i++) {
    ang += 9 * DT;   // giro do pulso em volta da direção da raquete (9 rad/s)
    const u = [-Math.sin(ang), Math.cos(ang), 0];
    g5.step({ hands: [paddle([0, 1.4, -0.45], [0, 0, -1], u), { on: false }] });
    if (g5.events.some(e => e.type === 'paddle')) curved = { c: b5.curve.slice(), x0: b5.p[0] };
  }
  ok(curved && len(curved.c) > 0.8 && len(curved.c) <= BALL.curveMax + 1e-6, `giro do pulso dá curva leve (${curved && len(curved.c).toFixed(2)} m/s²)`);
  ok(curved && Math.abs(b5.p[0] - curved.x0) > 0.15, `a bola curva de lado (${curved && (b5.p[0] - curved.x0).toFixed(2)} m)`);
  // mãos: a outra também rebate
  const g6 = empty();
  ball(g6, [-0.3, 1.4, -1.2], [0, 0, 4]);
  const ev6 = run(g6, 0.5, { hands: [paddle([-0.3, 1.4, -0.45]), paddle([0.3, 1.4, -0.45])] });
  ok(ev6.some(e => e.type === 'paddle' && e.hand === 0), 'a mão esquerda também rebate');
}

console.log('Vidas e saque');
{
  const g = new Game(0, { serveDelay: 0.1 });
  run(g, 0.2);
  ok(g.balls.length === 1 && g.balls[0].serve, 'saque: a bola aparece na frente');
  run(g, 3);
  ok(g.lives === LIVES, 'errar o saque não tira vida');
  ok(g.balls.length === 1 || g.serveT > 0, 'saque de novo');
  const g2 = empty();
  ball(g2, [0, 1.4, -0.5], [0, 0, 4]);
  const evs = run(g2, 0.4);
  ok(evs.some(e => e.type === 'lost-ball') && g2.lives === LIVES - 1, 'bola que passa tira uma vida');
  const g3 = empty();
  g3.lives = 1;
  ball(g3, [0, 1.4, -0.5], [0, 0, 4]);
  run(g3, 0.4);
  ok(g3.phase === 'lost' && g3.result && !g3.result.won, 'sem vidas perde a fase');
  // com duas bolas, perder uma não tira vida
  const g4 = empty();
  ball(g4, [0, 1.4, -0.5], [0, 0, 4]); ball(g4, [0, 1.4, -5], [0, 0, -4]);
  run(g4, 0.3);
  ok(g4.lives === LIVES && g4.balls.length === 1, 'com duas bolas, perder uma não tira vida');
}

console.log('Tijolos');
{
  const g = empty();
  const k = brick(g, 'n', [0, 1.4, -5]);
  const b = ball(g, [0, 1.4, -3], [0, 0, -4]);
  const evs = run(g, 1);
  ok(!k.alive && evs.some(e => e.type === 'break' && e.id === k.id), 'tijolo comum quebra com uma batida');
  ok(b.v[2] > 0, 'a bola volta do tijolo');
  ok(g.score === KIND.n.score, 'pontos do tijolo');
  const g2 = empty();
  const d = brick(g2, 'd', [0, 1.4, -5]);
  let hits = 0;
  for (let k2 = 0; k2 < 3; k2++) { ball(g2, [0, 1.4, -3], [0, 0, -4]); const e = run(g2, 0.8); hits += e.filter(x => x.type === 'crack' || x.type === 'break').length; g2.balls = []; }
  ok(!d.alive && hits === 3, `tijolo duro precisa de 3 batidas (${hits})`);
  const g3 = empty();
  const s = brick(g3, 's', [0, 1.4, -5]);
  ball(g3, [0, 1.4, -3], [0, 0, -4]);
  const e3 = run(g3, 1);
  ok(s.alive && e3.some(e => e.type === 'ping'), 'pedra não quebra');
  // combo: vários tijolos na mesma ida valem mais
  const g4 = empty();
  brick(g4, 'n', [0, 1.4, -5]); brick(g4, 'n', [0, 1.4, -6.5]);
  ball(g4, [0, 1.4, -5.9], [0, 0, -4]);   // entre os dois: bate num e no outro
  const e4 = run(g4, 2);
  const br = e4.filter(e => e.type === 'break');
  ok(br.length === 2 && br[1].combo === 2 && br[1].pts > br[0].pts, 'combo: o segundo tijolo da mesma ida vale mais');
  // ganhar: quebrar tudo
  const g5 = new Game(0, { serveDelay: 1e9 });
  for (const b5 of g5.bricks) b5.alive = false;
  g5.step(off);
  ok(g5.phase === 'won' && g5.result.won && g5.result.stars >= 1, 'quebrou tudo: venceu');
  // pedra não conta
  const g6 = new Game(9, { serveDelay: 1e9 });
  for (const b6 of g6.bricks) if (b6.type !== 's') b6.alive = false;
  g6.step(off);
  ok(g6.phase === 'won', 'pedras não precisam ser quebradas');
}

console.log('Tijolos especiais');
{
  // ímã puxa a bola
  const g = empty();
  brick(g, 'm', [1.0, 1.4, -5]);
  const b = ball(g, [0, 1.4, -3], [0, 0, -4]);
  run(g, 0.4);
  ok(b.v[0] > 0.3, `ímã puxa a bola (vx ${b.v[0].toFixed(2)})`);
  // bola extra
  const g2 = empty();
  brick(g2, 'x', [0, 1.4, -5]);
  ball(g2, [0, 1.4, -3], [0, 0, -4]);
  const e2 = run(g2, 0.8);
  ok(e2.some(e => e.type === 'extra-ball') && g2.balls.length === 2, 'tijolo de bola extra solta outra bola');
  const g2b = empty();
  for (let i = 0; i < 4; i++) brick(g2b, 'x', [-0.9 + i * 0.6, 1.4, -5]);
  for (let i = 0; i < 4; i++) ball(g2b, [-0.9 + i * 0.6, 1.4, -3], [0, 0, -4]);
  run(g2b, 0.8);
  ok(g2b.balls.length <= Math.max(4, MAX_BALLS), 'número de bolas limitado');
  // andante anda
  const ga = new Game(5, { serveDelay: 1e9 });
  const a = ga.bricks.find(k => k.type === 'a');
  const x0 = a.c[0];
  run(ga, 1);
  ok(Math.abs(a.c[0] - x0) > 0.1, 'tijolo andante anda');
  // bomba quebra os vizinhos
  const g3 = empty();
  brick(g3, 'b', [0, 1.4, -5]);
  const n1 = brick(g3, 'n', [0.43, 1.4, -5]), n2 = brick(g3, 'd', [0, 1.62, -5]), far = brick(g3, 'n', [1.0, 1.4, -5]), st = brick(g3, 's', [-0.43, 1.4, -5]);
  ball(g3, [0, 1.4, -3], [0, 0, -4]);
  const e3 = run(g3, 0.7);
  ok(e3.some(e => e.type === 'bomb') && !n1.alive && !n2.alive, 'bomba quebra os vizinhos (até o duro)');
  ok(far.alive && st.alive, 'bomba não quebra longe nem pedra');
  // fogo: o tijolo de fogo liga; com fogo a bola atravessa
  const g4f = empty();
  brick(g4f, 'f', [0, 1.4, -5]);
  ball(g4f, [0, 1.4, -3], [0, 0, -4]);
  run(g4f, 0.8);
  ok(g4f.power.fire > 0, 'tijolo de fogo liga a bola de fogo');
  const g4 = empty();
  g4.power.fire = POWER.fire;
  const n3 = brick(g4, 'n', [0, 1.4, -4]), n4 = brick(g4, 'd', [0, 1.4, -5]);
  const b4 = ball(g4, [0, 1.4, -3], [0, 0, -4]);
  run(g4, 0.6);
  ok(!n3.alive && !n4.alive, 'bola de fogo atravessa e quebra até o duro');
  ok(b4.v[2] < 0, 'com fogo a bola não volta do tijolo');
  // rede salva uma vez
  const g5 = empty();
  g5.power.net = POWER.net;
  const b5 = ball(g5, [0, 1.4, -0.5], [0, 0, 4]);
  const e5 = run(g5, 0.5);
  ok(e5.some(e => e.type === 'net-save') && g5.lives === LIVES && b5.v[2] < 0, 'rede salva a bola');
  ok(g5.power.net === 0, 'rede só salva uma vez');
  // relógio deixa mais lento
  const g6 = empty();
  brick(g6, 't', [0, 1.4, -5]);
  const b6 = ball(g6, [0, 1.4, -3], [0, 0, -4]);
  run(g6, 1.0);
  ok(near(len(b6.v), g6.W.speed * SLOW, 0.3), `relógio deixa a bola lenta (${len(b6.v).toFixed(2)})`);
  // raquetão
  const g7 = empty();
  g7.power.big = POWER.big;
  ball(g7, [0.21, 1.4, -1.2], [0, 0, 4]);
  const e7 = run(g7, 0.5, { hands: [paddle([0, 1.4, -0.45]), { on: false }] });
  ok(e7.some(e => e.type === 'paddle'), 'raquetão alcança mais longe');
  // poderes acabam
  const g8 = empty();
  g8.power.big = 0.5;
  const e8 = run(g8, 1);
  ok(g8.power.big === 0 && e8.some(e => e.type === 'power-end'), 'poder acaba no tempo');
}

console.log('Chefes');
{
  // Muralha avança e, se chegar perto, tira uma vida e recua
  const g = new Game(3, { serveDelay: 1e9 });
  const z0 = g.bricks[0].c[2];
  run(g, 5);
  ok(g.bricks[0].c[2] > z0 + 0.2, 'Muralha avança');
  const before = g.wallZ;
  const k = g.bricks.find(b => b.type === 'n');
  g.damage(k, 1, null);
  ok(g.wallZ < before, 'quebrar tijolo empurra a Muralha para trás');
  g.wallZ = 20;
  const ev = run(g, 0.1);
  ok(ev.some(e => e.type === 'wall-crash') && g.lives === LIVES - 1, 'Muralha encostou: perde vida e ela recua');
  // Totem gira, anéis voltam, núcleo derruba
  const gt = new Game(7, { serveDelay: 1e9 });
  const ring = gt.bricks.find(b => b.type === 'ring');
  const p0 = ring.c.slice();
  run(gt, 1);
  ok(len(sub(ring.c, p0)) > 0.2, 'anéis do totem giram');
  gt.damage(ring, 1, null);
  ok(!ring.alive, 'anel quebra');
  run(gt, 10);
  ok(ring.alive, 'anel volta depois de um tempo');
  for (let i = 0; i < KIND.core.hp; i++) gt.damage(gt.core, 1, null);
  gt.step(off);
  ok(gt.phase === 'won', 'núcleo derrubado vence o Totem');
  // Rei: fechado não leva dano; com guardas quebrados, leva
  const gk = new Game(11, { serveDelay: 1e9 });
  gk.damage(gk.core, 1, null);
  ok(gk.core.hp === KIND.king.hp, 'Rei com os guardas não leva dano');
  gk.bricks.filter(b => b.type === 'guard').slice(0, KING.open).forEach(b => gk.damage(b, 1, null));
  gk.damage(gk.core, 1, null);
  ok(gk.core.hp === KIND.king.hp - 1, 'Rei sem guardas leva dano');
  // pedras: rebatidas somem; deixar passar atordoa
  const gr = new Game(11, { serveDelay: 1e9 });
  const ev2 = run(gr, KING.rockEvery + 0.1);
  ok(ev2.some(e => e.type === 'rock-throw') && gr.rocks.length === 1, 'Rei joga pedra');
  const rock = gr.rocks[0];
  const ev3 = run(gr, 6, () => { const r = gr.rocks[0]; return { hands: [r ? paddle([r.p[0], r.p[1], -0.45]) : { on: false }, { on: false }] }; });
  ok(ev3.some(e => e.type === 'rock-smash'), 'pedra rebatida quebra');
  const gr2 = new Game(11, { serveDelay: 1e9 });
  const ev4 = run(gr2, KING.rockEvery + 4);
  ok(ev4.some(e => e.type === 'rock-hit') && gr2.lives === LIVES, 'pedra que passa atordoa (não tira vida)');
}

console.log('Robô (limites humanos) nas 12 fases');
{
  const SEEDS = [1, 2, 3, 4, 5];
  let total = 0;
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const rs = [];
    for (const seed of SEEDS) {
      const g = new Game(lv, { seed });
      const robot = makeRobot({ seed: seed * 7 });
      let maxSpeed = 0, lastP = null;
      while (!g.over && g.t < 600) {
        const inp = robot.step(g);
        const p = inp.hands[1].p;
        if (lastP) maxSpeed = Math.max(maxSpeed, len(sub(p, lastP)) / DT);
        lastP = p;
        g.step(inp);
      }
      ok(maxSpeed <= 2.6 + 1e-6, `fase ${lv + 1}: a mão do robô não passa de 2,6 m/s (${maxSpeed.toFixed(2)})`);
      rs.push(g.result || { won: false, eff: 999, stars: 0 });
    }
    const allWon = rs.every(r => r.won), minStars = Math.min(...rs.map(r => r.stars));
    ok(allWon, `fase ${lv + 1}: o robô vence com as ${SEEDS.length} sementes`);
    ok(minStars >= 2, `fase ${lv + 1}: o robô faz pelo menos 2 estrelas (${rs.map(r => r.stars).join(' ')})`);
    total += rs.reduce((s, r) => s + r.stars, 0);
    console.log(`  ${String(lv + 1).padStart(2)} ${LEVELS[lv].name.padEnd(22)} tempo efetivo ${rs.map(r => Math.round(r.eff)).join(' ').padEnd(24)} estrelas ${rs.map(r => r.stars).join('')}  (limites ${LEVELS[lv].par.join('/')})`);
  }
  console.log(`  média de estrelas do robô: ${(total / (SEEDS.length * LEVELS.length)).toFixed(2)}`);
}

console.log(fails ? `\n${fails} de ${count} testes falharam` : `\nTudo certo (${count} testes)`);
process.exit(fails ? 1 : 0);
