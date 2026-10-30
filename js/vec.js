// Vetores 3D como arrays [x, y, z] e um gerador de números aleatórios com semente.
// Sem navegador e sem Three.js (os testes rodam no Node).
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const DEG = Math.PI / 180;

// Direção a partir de azimute e elevação (graus). az 0 = frente (-z), 90 = direita (+x),
// 180 = atrás; el 90 = para cima.
export function dirFrom(az, el) {
  const a = az * DEG, e = el * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
export function azElOf(d) {
  const n = norm(d);
  return { az: Math.atan2(n[0], -n[2]) / DEG, el: Math.asin(clamp(n[1], -1, 1)) / DEG };
}

export function angle(a, b) {
  return Math.acos(clamp(dot(a, b) / ((len(a) * len(b)) || 1), -1, 1));
}

// Gira o vetor unitário `cur` na direção de `target` (unitário) no máximo `maxAng` radianos.
export function rotateToward(cur, target, maxAng) {
  const ang = angle(cur, target);
  if (ang <= maxAng || ang < 1e-6) return norm(target);
  // eixo perpendicular a cur, no plano de cur e target
  let perp = sub(target, mul(cur, dot(cur, target)));
  if (len(perp) < 1e-6) perp = any_perp(cur);
  perp = norm(perp);
  return norm(add(mul(cur, Math.cos(maxAng)), mul(perp, Math.sin(maxAng))));
}

export function any_perp(v) {
  const a = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(v, a));
}

// Reflete v na superfície de normal n (unitária).
export const reflect = (v, n) => madd(v, n, -2 * dot(v, n));

// Ponto mais perto de p dentro da caixa de centro c e meia-medida h.
export const boxClosest = (p, c, h) => [clamp(p[0], c[0] - h[0], c[0] + h[0]), clamp(p[1], c[1] - h[1], c[1] + h[1]), clamp(p[2], c[2] - h[2], c[2] + h[2])];

// Mulberry32: aleatório repetível a partir de uma semente.
export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}
