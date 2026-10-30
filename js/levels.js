// As 12 fases em 3 mundos, em notação compacta. Sem navegador.
//
// Legenda dos tijolos (um caractere por casa):
//   .  vazio                  n  comum (1 batida)        d  duro (3 batidas, racha)
//   s  pedra (não quebra e não precisa quebrar)           m  ímã (puxa a bola enquanto existir)
//   x  bola extra             a  andante (vai e volta)   b  bomba (quebra os vizinhos)
//   f  fogo (a bola atravessa os tijolos por 6 s)        r  rede (salva a bola uma vez atrás de você)
//   t  relógio (bola mais lenta por 8 s)                 g  raquetão (raquete 50% maior por 12 s)
//
// Paredes (cada linha é uma fileira, de cima para baixo, menos o teto):
//   back   parede do fundo: 6 casas por linha, da esquerda para a direita; 11 linhas no máximo
//          (linha 0 em 2,5 m de altura, linha 5 em 1,4 m, linha 10 em 0,3 m)
//   left / right   paredes dos lados: 7 casas por linha, do fundo para perto de você
//   top    teto: 6 casas por linha (esquerda para direita); cada linha, do fundo para perto
//
// boss: 'wall' (Muralha: a parede do fundo avança), 'totem' (anéis giratórios em volta de um
// núcleo), 'king' (Rei Tijolo: bloco que passeia, guardas em volta e pedras jogadas em você).
// par: [3 estrelas, 2 estrelas] em segundos de "tempo efetivo" (tempo + 15 s por vida perdida),
// calibrados pelo robô (ver tests/run.js).

export const WORLDS = [
  { name: 'Oficina do Oleiro', short: 'Oficina', speed: 3.6, theme: 0, hint: 'Rebata com a raquete: bata mais rápido para a bola ir mais forte.' },
  { name: 'Aquário Fundo', short: 'Aquário', speed: 4.0, theme: 1, hint: 'Ímãs puxam a bola e tijolos andantes fogem: mire com calma.' },
  { name: 'Fornalha Neon', short: 'Fornalha', speed: 4.4, theme: 2, hint: 'Bombas quebram os vizinhos. Pedras não quebram: desvie delas.' },
];

export const LEVELS = [
  // ---------- Mundo 1: Oficina ----------
  {
    name: 'Primeira parede', world: 0, par: [100, 155],
    back: ['......', '......', 'nnnnnn', 'nngnnn', 'nnnnnn', 'nnnnxn', 'nnnnnn'],
  },
  {
    name: 'Duro de roer', world: 0, par: [150, 190],
    back: ['......', '..dd..', 'nnnnnn', 'ndnndn', 'nnrnnn', 'dnnnnd'],
  },
  {
    name: 'Paredes de lado', world: 0, par: [135, 200],
    back: ['......', '......', 'nnnnnn', 'nnfnnn', 'nnnnnn', 'dnnnnd'],
    left: ['.......', '.......', '.......', 'nnnn...', 'nxnn...', 'nnnn...'],
    right: ['.......', '.......', '.......', 'nnnn...', 'nngn...', 'nnnn...'],
  },
  {
    name: 'Muralha', world: 0, boss: 'wall', par: [105, 145],
    back: ['nnnnnn', 'ndnndn', 'nnnnnn', 'nnxnnn', 'nnnnnn', 'dnnnnd', 'nnrnnn', 'nnnnnn'],
  },
  // ---------- Mundo 2: Aquário ----------
  {
    name: 'Ímãs de geladeira', world: 1, par: [80, 150],
    back: ['......', 'n.nn.n', 'nmnnmn', 'nnnnnn', 'nnxnnn', 'nnnnnn', 'n....n'],
  },
  {
    name: 'Cardume', world: 1, par: [135, 230],
    back: ['......', '..a...', 'nnnnnn', '...a..', 'nnnnnn', 'a.....', 'ntnnnn'],
    left: ['.......', '.......', 'nnn....', 'nnn....'],
    right: ['.......', '.......', 'nnn....', 'nnn....'],
  },
  {
    name: 'Teto de coral', world: 1, par: [100, 140],
    back: ['......', '......', '......', 'nnmnnn', 'nnnnnn', 'nnnxnn'],
    top: ['nnnnnn', 'nndnnn', 'nngnnn', 'nnnnnn'],
  },
  {
    name: 'Totem do Polvo', world: 1, boss: 'totem', par: [82, 115],
    back: ['......', '......', '..nn..', '.n..n.', '..nn..'],
  },
  // ---------- Mundo 3: Fornalha ----------
  {
    name: 'Fogos de artifício', world: 2, par: [45, 75],
    back: ['......', 'nnnnnn', 'nbnnbn', 'nnnnnn', 'nnbnnn', 'nnnnnn', 'nnnnfn'],
  },
  {
    name: 'Labirinto de pedra', world: 2, par: [90, 140],
    back: ['......', 'nnnnnn', 'sn..ns', 'nnnnnn', 's.ss.s', 'nnxnnn', 'nnnnnn'],
    left: ['.......', '.......', '.......', 'nn.....', 'nn.....'],
    right: ['.......', '.......', '.......', 'nn.....', 'nn.....'],
  },
  {
    name: 'Tudo ao mesmo tempo', world: 2, par: [85, 145],
    back: ['......', 'dnnnnd', 'nmnnbn', '..a...', 'nnnnnn', 'nbnnxn', 'nnrnnn'],
    top: ['nnnnnn', 'nn..nn'],
  },
  {
    name: 'Rei Tijolo', world: 2, boss: 'king', par: [62, 200],
    back: ['......', '......', 'n....n', 'n....n'],
  },
];

export const LEVELS_PER_WORLD = 4;

export function starsFor(level, effTime) {
  const p = LEVELS[level].par;
  return effTime <= p[0] ? 3 : effTime <= p[1] ? 2 : 1;
}
