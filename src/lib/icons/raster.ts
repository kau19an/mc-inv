// desenha um ícone de item num buffer rgba, do mesmo jeito que o jogo faz na gui:
// - itens "chapados": camadas de textura no slot inteiro
// - blocos: cubos com a transformação de gui do modelo (ex.: rotação 30/225, escala 0.625), projeção
//   ortográfica, z-buffer e sombreamento por face
// sem dependências e sem apis do node: roda igual no build e no navegador
import type { BlockModel, Element, Face, FaceName, FlatModel, IconModel, MeshModel, Texture, TextureLookup, Tint, Vec3 } from './types.ts';

export interface RenderOptions {
  size: number; // lado do ícone em pixels (16 = 1 pixel por pixel da gui)
  tints: Tint[]; // cor por tintIndex
  textures: TextureLookup;
}

export interface Icon {
  size: number;
  data: Uint8ClampedArray; // rgba
  missing: string[]; // texturas que não foram encontradas
}

const TINT_NONE = -1;

// argb inteiro → [r, g, b] de 0 a 1
function tintColor(tints: Tint[], index: number): [number, number, number] {
  if (index < 0) return [1, 1, 1];
  const argb = tints[index];
  if (argb === undefined || argb === TINT_NONE) return [1, 1, 1];
  return [((argb >> 16) & 255) / 255, ((argb >> 8) & 255) / 255, (argb & 255) / 255];
}

// pixel da textura (vizinho mais próximo, como o jogo). u/v em 0..1
function sample(texture: Texture, u: number, v: number): [number, number, number, number] {
  // texturas animadas já chegam só com o primeiro quadro (quadrado), então altura = largura
  const x = Math.min(texture.width - 1, Math.max(0, Math.floor(u * texture.width)));
  const y = Math.min(texture.height - 1, Math.max(0, Math.floor(v * texture.height)));
  const i = (y * texture.width + x) * 4;
  return [texture.data[i]!, texture.data[i + 1]!, texture.data[i + 2]!, texture.data[i + 3]!];
}

// "alpha over": desenha a cor por cima do que já está no pixel
function blend(out: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) {
  if (a >= 255) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
    return;
  }
  const srcA = a / 255;
  const dstA = out[i + 3]! / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  out[i] = (r * srcA + out[i]! * dstA * (1 - srcA)) / outA;
  out[i + 1] = (g * srcA + out[i + 1]! * dstA * (1 - srcA)) / outA;
  out[i + 2] = (b * srcA + out[i + 2]! * dstA * (1 - srcA)) / outA;
  out[i + 3] = outA * 255;
}

function renderFlat(model: FlatModel, options: RenderOptions, out: Uint8ClampedArray, missing: string[]) {
  const { size } = options;
  for (const layer of model.layers) {
    const texture = options.textures(layer.texture);
    if (!texture) {
      missing.push(layer.texture);
      continue;
    }
    const [tr, tg, tb] = tintColor(options.tints, layer.tintIndex);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [r, g, b, a] = sample(texture, (x + 0.5) / size, (y + 0.5) / size);
        if (a === 0) continue;
        blend(out, (y * size + x) * 4, r * tr, g * tg, b * tb, a);
      }
    }
  }
}

// ---------- 3d ----------

type Mat3 = [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;

function rotationX(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
function rotationY(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
function rotationZ(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
function multiply(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
}
function apply(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

// cantos de cada face na ordem: topo-esquerda, topo-direita, base-direita, base-esquerda (vista de fora),
// que é a ordem dos cantos do uv: (u1,v1) (u2,v1) (u2,v2) (u1,v2)
function faceCorners(face: FaceName, [x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3[] {
  switch (face) {
    case 'south': return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]];
    case 'north': return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]];
    case 'east': return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]];
    case 'west': return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]];
    case 'up': return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]];
    case 'down': return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]];
  }
}

const FACE_NORMALS: Record<FaceName, Vec3> = {
  north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};

// rotação de um elemento (ex.: tochas inclinadas) em torno da origem dele
function elementRotation(element: Element): ((v: Vec3) => Vec3) | null {
  const rotation = element.rotation;
  if (!rotation || rotation.angle === 0) return null;
  const angle = rotation.angle * DEG;
  const matrix = rotation.axis === 'x' ? rotationX(angle) : rotation.axis === 'y' ? rotationY(angle) : rotationZ(angle);
  // rescale: estica de volta pra ocupar o bloco inteiro depois de girar 22.5/45 graus
  const factor = rotation.rescale ? 1 / Math.cos(Math.abs(angle)) : 1;
  const stretch: Vec3 = rotation.axis === 'x' ? [1, factor, factor] : rotation.axis === 'y' ? [factor, 1, factor] : [factor, factor, 1];
  const [ox, oy, oz] = rotation.origin;
  return ([x, y, z]) => {
    const [rx, ry, rz] = apply(matrix, [x - ox, y - oy, z - oz]);
    return [rx * stretch[0] + ox, ry * stretch[1] + oy, rz * stretch[2] + oz];
  };
}

// luz da gui pra modelos "side" (blocos): o topo é o mais claro, a face da esquerda é média e a da
// direita é a mais escura. aproximação pela normal já transformada (x pra direita, y pra cima, z pra tela)
function brightness(normal: Vec3, shade: boolean, light: 'side' | 'front'): number {
  if (!shade || light === 'front') return 1;
  const [nx, ny] = normal;
  const top = Math.max(0, ny);
  const left = Math.max(0, -nx);
  const right = Math.max(0, nx);
  const bottom = Math.max(0, -ny);
  const total = top + left + right + bottom || 1;
  return (top * 1 + left * 0.8 + right * 0.6 + bottom * 0.5) / total;
}

// transformação de gui (ordem do jogo: translação · rotação x→y→z, como Quaternionf.rotationXYZ · escala)
// devolve a função modelo (0..16) → tela (pixels; y pra baixo; z maior = mais perto) e a matriz de rotação
function guiProjection(model: BlockModel | MeshModel, size: number) {
  const { rotation, translation, scale } = model.gui;
  const rotationMatrix = multiply(multiply(rotationX(rotation[0] * DEG), rotationY(rotation[1] * DEG)), rotationZ(rotation[2] * DEG));
  const pixelsPerUnit = size / 16;
  const toScreen = (v: Vec3): Vec3 => {
    const centered: Vec3 = [(v[0] - 8) * scale[0], (v[1] - 8) * scale[1], (v[2] - 8) * scale[2]];
    const [x, y, z] = apply(rotationMatrix, centered);
    return [(x + translation[0]) * pixelsPerUnit + size / 2, size / 2 - (y + translation[1]) * pixelsPerUnit, z];
  };
  return { toScreen, rotationMatrix };
}

function renderBlock(model: BlockModel, options: RenderOptions, out: Uint8ClampedArray, missing: string[]) {
  const { size } = options;
  const depth = new Float32Array(size * size).fill(-Infinity);
  const { toScreen, rotationMatrix } = guiProjection(model, size);

  for (const element of model.elements) {
    const rotate = elementRotation(element);
    for (const [name, face] of Object.entries(element.faces) as [FaceName, Face][]) {
      const texture = options.textures(face.texture);
      if (!texture) {
        missing.push(face.texture);
        continue;
      }
      const corners = faceCorners(name, element.from, element.to).map((corner) => toScreen(rotate ? rotate(corner) : corner));

      // normal na tela: descarta faces de costas e decide o sombreamento
      const baseNormal = FACE_NORMALS[name];
      const rotatedNormal = apply(rotationMatrix, rotate ? subtract(rotate(baseNormal), rotate([0, 0, 0])) : baseNormal);
      const screenNormal: Vec3 = [rotatedNormal[0], rotatedNormal[1], rotatedNormal[2]];
      if (screenNormal[2] < -1e-6) continue;
      const light = brightness(screenNormal, element.shade, model.light);
      const [tr, tg, tb] = tintColor(options.tints, face.tintIndex);

      // cantos do uv, girados conforme a rotação da face
      const [u1, v1, u2, v2] = face.uv;
      const uvCorners: [number, number][] = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]];
      const shift = face.rotation / 90;
      const uvs = corners.map((_, i) => uvCorners[(i + shift) % 4]!);

      // dois triângulos por face
      for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]] as const) {
        rasterTriangle(corners[a]!, corners[b]!, corners[c]!, uvs[a]!, uvs[b]!, uvs[c]!, (x, y, z, u, v) => {
          const i = y * size + x;
          if (z < depth[i]!) return;
          const [r, g, bl, alpha] = sample(texture, u / 16, v / 16);
          if (alpha === 0) return;
          if (alpha === 255) depth[i] = z;
          blend(out, i * 4, r * tr * light, g * tg * light, bl * tb * light, alpha);
        }, size);
      }
    }
  }
}

// malha de quadrados (modelos especiais exportados pelo jogo): mesma projeção dos blocos, mas cada quadrado
// já vem com os 4 vértices e uv (0..1). a normal sai do produto vetorial dos vértices na tela
function renderMesh(model: MeshModel, options: RenderOptions, out: Uint8ClampedArray, missing: string[]) {
  const { size } = options;
  const depth = new Float32Array(size * size).fill(-Infinity);
  const { toScreen } = guiProjection(model, size);
  for (const quad of model.quads) {
    const texture = options.textures(quad.texture);
    if (!texture) {
      missing.push(quad.texture);
      continue;
    }
    const corners = quad.vertices.map(toScreen);
    // normal em espaço de tela (y da tela é invertido, então desfaz antes de calcular a luz)
    const a = subtract(corners[1]!, corners[0]!);
    const b = subtract(corners[2]!, corners[0]!);
    const normal: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    const screenNormal: Vec3 = [normal[0] / length, -normal[1] / length, normal[2] / length];
    // modelos de entidade costumam ser desenhados dos dois lados (cutout sem culling), então não descarta pela normal;
    // a luz usa o lado que está virado pra tela
    const facing: Vec3 = screenNormal[2] < 0 ? [-screenNormal[0], -screenNormal[1], -screenNormal[2]] : screenNormal;
    const light = brightness(facing, true, model.light);
    const [tr, tg, tb] = quad.tint === TINT_NONE ? [1, 1, 1] : [((quad.tint >> 16) & 255) / 255, ((quad.tint >> 8) & 255) / 255, (quad.tint & 255) / 255];
    const uvs = quad.uvs.map(([u, v]) => [u * 16, v * 16] as [number, number]);
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]] as const) {
      rasterTriangle(corners[i]!, corners[j]!, corners[k]!, uvs[i]!, uvs[j]!, uvs[k]!, (x, y, z, u, v) => {
        const index = y * size + x;
        if (z < depth[index]!) return;
        const [r, g, bl, alpha] = sample(texture, u / 16, v / 16);
        if (alpha === 0) return;
        if (alpha === 255) depth[index] = z;
        blend(out, index * 4, r * tr * light, g * tg * light, bl * tb * light, alpha);
      }, size);
    }
  }
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

// preenche um triângulo pixel a pixel (centro do pixel), interpolando profundidade e uv.
// na projeção ortográfica a interpolação linear é exata
function rasterTriangle(
  p0: Vec3, p1: Vec3, p2: Vec3,
  t0: [number, number], t1: [number, number], t2: [number, number],
  plot: (x: number, y: number, z: number, u: number, v: number) => void,
  size: number,
) {
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  if (Math.abs(area) < 1e-9) return;
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
      const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      // uv recuado um tiquinho pra dentro: evita pegar o pixel vizinho da textura na borda
      const u = w0 * t0[0] + w1 * t1[0] + w2 * t2[0];
      const v = w0 * t0[1] + w1 * t1[1] + w2 * t2[1];
      plot(x, y, w0 * p0[2] + w1 * p1[2] + w2 * p2[2], u, v);
    }
  }
}

export function renderIcon(model: IconModel, options: RenderOptions): Icon {
  const out = new Uint8ClampedArray(options.size * options.size * 4);
  const missing: string[] = [];
  const draw = (part: IconModel) => {
    if (part.kind === 'flat') renderFlat(part, options, out, missing);
    else if (part.kind === 'block') renderBlock(part, options, out, missing);
    else if (part.kind === 'mesh') renderMesh(part, options, out, missing);
    else if (part.kind === 'composite') part.parts.forEach(draw);
  };
  draw(model);
  return { size: options.size, data: out, missing };
}
