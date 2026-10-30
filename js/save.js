// Progresso, recordes e opções, salvos no navegador.
const KEY = 'tijolovr.v1';
const DEFAULTS = {
  done: {},          // fases vencidas: { 0: { stars, score, time }, ... }
  scores: [],        // recordes do fliperama: [{ name: 'ABC', score, level }] (8 melhores)
  name: 'AAA',       // últimas letras usadas
  sound: true,
  music: true,
  fps: false,
};
export const MAX_SCORES = 8;

export function loadSave() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (typeof s.done !== 'object' || !s.done) s.done = {};
    if (!Array.isArray(s.scores)) s.scores = [];
    return s;
  } catch { return { ...DEFAULTS, done: {}, scores: [] }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}

// Entra no placar? (posição 0..7 ou -1)
export function rankOf(s, score) {
  if (score <= 0) return -1;
  const i = s.scores.findIndex(e => score > e.score);
  if (i >= 0) return i;
  return s.scores.length < MAX_SCORES ? s.scores.length : -1;
}
export function addScore(s, name, score, level) {
  s.scores.push({ name, score, level });
  s.scores.sort((a, b) => b.score - a.score);
  s.scores.length = Math.min(s.scores.length, MAX_SCORES);
}
