// brilho de encantamento (glint) por cima dos itens com foil (ItemStack.hasFoil: livro encantado, garrafa de
// experiência, estrela do nether…), como o jogo desenha:
// - textura misc/enchanted_glint_item.png (128×128, repetida, com filtro linear — "blur": true no .mcmeta);
// - coordenadas = as do próprio item no atlas, transformadas por TextureTransform.GLINT_TEXTURING:
//   translação (−deslocamento0, deslocamento1) · rotação de 10° · escala 8, com
//   ms = agora × velocidade do brilho × 8; deslocamento0 = (ms % 110000) / 110000; deslocamento1 = (ms % 30000) / 30000;
// - shader glint.fsh: cor = textura × intensidade do brilho; mistura GLINT (SRC_COLOR, ONE) = soma cor × cor;
// - só onde o item tem pixel (o teste de profundidade EQUAL do jogo).
// a posição de cada item no atlas do jogo muda de versão pra versão; aqui ela é sorteada (fixa) pelo id do item,
// então cada item tem a própria "fase" do brilho, como no jogo
import type { AtlasPixels } from '../icons/bundle.ts';

const GLINT_SPEED = 0.5; // opção "Velocidade do brilho" (padrão)
const GLINT_STRENGTH = 0.75; // opção "Intensidade do brilho" (padrão)
const SCALE = 8;
const ROTATION = Math.PI / 18;
// tamanho de um sprite de 16 px no atlas de itens (1024×512 na 26.x), em coordenadas de textura
const SPRITE_U = 16 / 1024;
const SPRITE_V = 16 / 512;

export interface Glint {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // rgba
}

export function glintOf(pixels: AtlasPixels): Glint {
  return { width: pixels.width, height: pixels.data.length / 4 / pixels.width, data: pixels.data };
}

// posição "no atlas" de cada item: sorteada pelo id (sempre a mesma pro mesmo item)
function atlasOrigin(key: string): [number, number] {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash >>>= 0;
  return [(hash % 64) * SPRITE_U, ((hash >>> 6) % 32) * SPRITE_V];
}

// textura com repetição e filtro linear
function sample(glint: Glint, u: number, v: number, out: number[]): void {
  const x = u * glint.width - 0.5;
  const y = v * glint.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrap = (n: number, size: number) => ((n % size) + size) % size;
  const xa = wrap(x0, glint.width);
  const xb = wrap(x0 + 1, glint.width);
  const ya = wrap(y0, glint.height) * glint.width;
  const yb = wrap(y0 + 1, glint.height) * glint.width;
  for (let c = 0; c < 3; c++) {
    const top = glint.data[(ya + xa) * 4 + c]! * (1 - fx) + glint.data[(ya + xb) * 4 + c]! * fx;
    const bottom = glint.data[(yb + xa) * 4 + c]! * (1 - fx) + glint.data[(yb + xb) * 4 + c]! * fx;
    out[c] = (top * (1 - fy) + bottom * fy) / 255;
  }
}

// deslocamentos da textura no instante (ms desde o início da página)
export function glintOffsets(now: number): [number, number] {
  const ms = Math.floor(now * GLINT_SPEED * 8);
  return [(ms % 110000) / 110000, (ms % 30000) / 30000];
}

// o que o brilho soma em cada pixel do ícone (rgb; alfa 255 onde o ícone tem pixel, 0 fora).
// mask = alfa do ícone renderizado (size × size)
export function renderGlint(glint: Glint, key: string, mask: Uint8Array, size: number, offsets: [number, number], out: ImageData): void {
  const [u0, v0] = atlasOrigin(key);
  const cos = Math.cos(ROTATION);
  const sin = Math.sin(ROTATION);
  const color = [0, 0, 0];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const index = py * size + px;
      const o = index * 4;
      if (!mask[index]) {
        out.data[o + 3] = 0;
        continue;
      }
      const su = SCALE * (u0 + ((px + 0.5) / size) * SPRITE_U);
      const sv = SCALE * (v0 + ((py + 0.5) / size) * SPRITE_V);
      sample(glint, cos * su - sin * sv - offsets[0], sin * su + cos * sv + offsets[1], color);
      for (let c = 0; c < 3; c++) {
        const value = color[c]! * GLINT_STRENGTH;
        out.data[o + c] = Math.round(value * value * 255);
      }
      out.data[o + 3] = 255;
    }
  }
}
