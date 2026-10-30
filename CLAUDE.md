# TijoloVR

Bate-Tijolo: quebra-tijolos em VR para o Meta Quest 3 no navegador (WebXR), sem instalar nada.
O jogador fica no começo de um corredor e **a mão é a raquete** (as duas mãos rebatem): a bola vai
até os tijolos da parede do fundo, das paredes dos lados e do teto e volta; se passar pelo
jogador, perde uma vida. A velocidade e o ângulo da batida mudam a bola, e girar o pulso dá efeito
(curva leve). 12 fases em 3 mundos (Oficina do Oleiro, Aquário Fundo, Fornalha Neon), a 4ª de cada
mundo é um chefe. Estrelas pelo tempo, modo Fliperama (as 12 seguidas) com recorde de 3 letras.
Também joga no PC com o mouse. Tudo em português. Jogo original dentro do gênero (nomes, visual,
tijolos e chefes próprios).

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos o endereço publicado (quando for publicado:
**https://parappathe.github.io/TijoloVR/**) e apertar "Entrar em VR". Para atualizar o site:
commitar e rodar `python publicar.py TijoloVR` na pasta `C:\claude code` (só quando o Eduardo pedir).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8843` (o painel de
visualização usa `.claude/launch.json`). O `serve.py` manda o navegador não guardar cache;
`python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Raquete | Cada controle (ou mão) segura uma raquete redonda 12 cm à frente; a cara dela aponta para onde a mão aponta | O mouse leva a raquete num plano na frente da câmera |
| Força | Bater mais rápido na direção da bola | Mexer o mouse mais rápido na hora da batida |
| Mira | Inclinar a raquete | Bater com a raquete perto da borda manda a bola para o lado; o movimento de lado do mouse também puxa |
| Efeito (curva) | Girar o pulso na hora da batida (torcer para os lados também curva) | Segurar Q ou E na hora da batida |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| FPS | Menu → FPS | Tecla F |

Na pausa do VR, "Recentralizar" põe a cabeça no meio do corredor olhando para o fundo. O controle
vibra a cada batida (mais forte quanto mais rápida), ao perder a bola e nas pancadas dos chefes.

### Regras

- **Corredor:** 2,6 m de largura, 2,7 m de altura, parede do fundo a 7 m. A bola quica no chão,
  no teto e nas paredes. Velocidade por mundo (3,6 / 4,0 / 4,4 m/s), nunca abaixo de 90% disso
  nem acima de 6,5 m/s (conforto); a força extra da batida some em ~2 s. A bola sempre avança
  pelo corredor (não fica indo de um lado para o outro) e a raquete nunca rebate para trás.
- **Funil de alcance:** nos últimos 3,5 m, a bola que volta é corrigida de leve para chegar na
  área que a mão alcança (x ±0,6 m, altura 0,85 a 1,85 m), para não precisar andar pelo quarto.
- **Vidas:** 3 por fase. Saque: a bola aparece flutuando na frente e vem devagar; errar o saque não
  tira vida. Com várias bolas, só perde vida quando passa a última.
- **Tijolos** (legenda em `js/levels.js`): comum; duro (3 batidas, racha); pedra (não quebra e não
  precisa); ímã (puxa a bola enquanto existir); bola extra (até 3 bolas); andante (vai e volta);
  bomba (quebra os vizinhos, até os duros); fogo (6 s de bola que atravessa os tijolos); rede
  (salva a bola uma vez, por até 20 s); relógio (bola 35% mais lenta por 8 s); raquetão (raquete
  50% maior por 12 s).
- **Pontos:** cada tijolo vale pontos, multiplicados pelo combo (tijolos quebrados na mesma ida,
  sem tocar na raquete). No fim: bônus de vidas e de tempo.
- **Chefes:** Fase 4, **Muralha**: a parede do fundo avança devagar; cada tijolo quebrado empurra
  de volta; se ela chegar a 2,3 m, tira uma vida e recua. Fase 8, **Totem do Polvo**: núcleo com
  10 de vida dentro de 3 anéis de tijolos girando (os anéis voltam 9 s depois de quebrados). Fase
  12, **Rei Tijolo**: passeia no fundo com 6 guardas em volta; só leva dano com 3 guardas quebrados
  (eles voltam em 15 s); joga pedras a cada 6 s: rebater quebra a pedra, deixar passar deixa a
  raquete tonta por 1 s e tira 200 pontos (não tira vida).
- **Estrelas** pelo "tempo efetivo" (tempo + 15 s por vida perdida); limites em `par` de cada fase.
  Vencer libera a próxima.
- **Fliperama:** as 12 fases seguidas com as vidas que sobraram (+1 vida a cada chefe), pontos
  somados; no fim, se entrar nos 8 melhores, escolhe 3 letras (no PC dá para digitar).
- Progresso, recordes e opções no navegador (localStorage `tijolovr.v1`).

Fases (em `js/levels.js`): Oficina: 1 Primeira parede, 2 Duro de roer, 3 Paredes de lado,
4 Muralha. Aquário: 5 Ímãs de geladeira, 6 Cardume, 7 Teto de coral, 8 Totem do Polvo.
Fornalha: 9 Fogos de artifício, 10 Labirinto de pedra, 11 Tudo ao mesmo tempo, 12 Rei Tijolo.

## Como testar

- `node tests/run.js` (ou `npm test`): vetores, fases (tamanho das linhas, legenda, tijolos dentro
  do corredor, chefe só na 4ª), bola (paredes, limites de velocidade, força que some, sempre
  avança), funil (bolas mandadas para os cantos chegam ao alcance), raquete (parada rebate, batida
  rápida manda mais rápido, inclinação mira, nunca para trás, bola longe passa, giro do pulso dá
  curva, as duas mãos), vidas e saque, tijolos (comum, duro, pedra, combo, vencer), especiais
  (ímã, bola extra, andante, bomba, fogo, rede, relógio, raquetão, fim dos poderes), chefes
  (Muralha avança/recua, anéis do Totem giram e voltam, Rei fechado/aberto, pedras) e o **robô**:
  joga as 12 fases com 5 sementes cada, com limites humanos (mão até 2,6 m/s, giro até 8 rad/s,
  reação de 0,3 s, alcance na frente do corpo, erro de posição de até 7 cm e de ângulo de 1,2°) e
  tem que vencer todas com pelo menos 2 estrelas. Imprime o tempo efetivo por fase. Termina com
  "Tudo certo". Não toca som.
- No navegador (console): `dev.loadLevel(8)` abre a fase 8 (1 a 12, ignora o bloqueio),
  `dev.autoplay = true` faz o robô jogar, `dev.advance(20)` avança 20 s na hora, `dev.state()`
  mostra tela, fase, vidas, pontos, bolas, tijolos que faltam, poderes e chefe, `dev.arcade()`
  começa o fliperama, `dev.snapshot()` devolve a imagem da tela (JPEG em data URL),
  `dev.resetSave()` apaga progresso e recordes. `window.tijolo` tem `game`, `save`, `sfx`,
  `robot`, `startLevel`, `startArcade`, `goMenu`.
- **Só dá para testar no óculos:** se a raquete presa ao controle fica num lugar natural (12 cm à
  frente, cara para onde a mão aponta), força e curva da batida de verdade, rastreamento de mãos,
  recentralizar, vibração, conforto e FPS no Quest.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", HUD do PC (fase, tempo, poderes, avisos) |
| `js/vec.js` | Vetores 3D em arrays, reflexão, ponto mais perto da caixa, aleatório com semente. Sem navegador |
| `js/sim.js` | Regras: `Game` (corredor, bola com efeito, ímãs, funil, velocidade, raquetes, tijolos, poderes, vidas, chefes, pedras, estrelas e pontos), `freeStep` e `posAt` (puros, usados pelo robô). Sem navegador |
| `js/levels.js` | Os 3 mundos e as 12 fases em notação compacta (legenda no topo) e os limites de estrelas. Sem navegador |
| `js/robot.js` | Robô com limites humanos: prevê onde a bola chega, escolhe um tijolo que a bola alcança numa simulação e inclina a raquete. Testes e `dev.autoplay`. Sem navegador |
| `js/main.js` | Liga tudo: render, VR (raquetes nos controles, vibração, recentralizar), mouse/teclado, menus (fases, fliperama, recordes, letras), letreiro, eventos → sons e efeitos, `dev` |
| `js/scene.js` | Os 3 corredores (texturas desenhadas em canvas, vigas e lâmpadas, vidro com peixes, neon e brasa), letreiro do placar com lâmpadas, tijolos e ícones instanciados, bolas, pedras, raquete, Totem, Rei, rede, partículas |
| `js/ui.js` | Painel de menu 3D em canvas, quadradinhos de fase e placas de texto |
| `js/audio.js` | Sons sintetizados com áudio 3D (HRTF) e uma musiquinha de fliperama por mundo |
| `js/save.js` | Progresso, recordes (8 melhores) e opções |
| `tests/run.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8843, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: metros; chão em y = 0, o jogador em x = 0, z = 0 olhando para -z. O corredor vai de
x = -1,3 a 1,3, y de 0 a 2,7, até a parede do fundo em z = -7. A bola que passa de z = 0,3 está
perdida. A raquete costuma bater em z ≈ -0,45 (plano da raquete do PC e do robô).

## Regras e convenções do projeto

- `vec.js`, `sim.js`, `levels.js` e `robot.js` não podem usar navegador nem Three.js: os testes
  rodam no Node.
- `scene.js` desenha corredor e tijolos com as mesmas medidas de `ROOM` e `GRID` do `sim.js`.
- Fase nova ou mudada: seguir a legenda de `levels.js`, rodar `node tests/run.js` e conferir o
  tempo efetivo do robô impresso no fim; `par` tem que deixar o robô com 2 estrelas ou mais com
  folga (3 estrelas perto do tempo típico dele).
- Mexeu em regras, tijolos, chefes ou robô: rodar `node tests/run.js`.
- Eventos do jogo (`game.events`) são a única ponte da lógica para som, vibração e efeitos.
- A física roda em passos fixos de 1/120 s; no navegador a pose da raquete é interpolada entre um
  quadro e outro dentro dos passos (senão a velocidade da raquete sairia aos trancos).

## Decisões

- As duas mãos rebatem (raquetes iguais): mais natural no VR e ajuda com várias bolas.
- A raquete é um disco preso à frente do controle, com a cara para onde a mão aponta ("aponte
  para onde quer mandar"); girar o pulso em volta dessa direção vira curva.
- Conforto: velocidade da bola limitada (máx. 6,5 m/s), jogador parado, funil de alcance perto
  do jogador, sem mexer a câmera no VR.
- No PC a raquete anda só num plano; a velocidade do mouse vira um "empurrão" para a frente
  (campo `push` da entrada) para a força funcionar igual.
- Errar o saque não tira vida; pedra do Rei atordoa em vez de tirar vida (o chefe já é difícil).
- Estrelas por tempo (com 15 s de multa por vida perdida), calibradas pelo robô.
- Pontos e combo para o clima de fliperama; recorde só no modo Fliperama (as 12 seguidas).
- Desempenho de Quest: pixelRatio 1, foveação, tijolos e ícones em InstancedMesh, partículas num
  só `Points`, 2 luzes sem sombra, sem pós-processamento.
- Porta do servidor local 8843.

## Pendências / problemas conhecidos

- **Nada foi testado no Quest ainda**: posição e ângulo da raquete no controle, força e efeito da
  batida, rastreamento de mãos, recentralizar, vibração, conforto e FPS no óculos.
- Sons e música só foram checados por não dar erro; ninguém ouviu ainda.
- A dificuldade foi calibrada pelo robô (que quase nunca perde a bola); pode estar fácil ou
  difícil para gente de verdade. Os limites de estrela estão em `par` de cada fase.
