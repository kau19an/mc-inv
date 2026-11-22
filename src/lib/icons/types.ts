// modelo de ícone já "resolvido": o que o renderizador precisa pra desenhar, sem depender de arquivos.
// quem resolve (lê items/, models/, texturas) é o pipeline; quem desenha é o raster.ts (roda no node e no navegador)

export type Vec3 = [number, number, number];

// cor multiplicada na textura (argb como inteiro, igual ao jogo; -1 = sem tint)
export type Tint = number;

export type FaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export interface Face {
  texture: string; // id da textura, ex.: "minecraft:block/oak_log"
  uv: [number, number, number, number]; // em pixels de 0 a 16
  rotation: 0 | 90 | 180 | 270;
  tintIndex: number; // -1 = sem tint
}

export interface Element {
  from: Vec3;
  to: Vec3;
  rotation?: { origin: Vec3; axis: 'x' | 'y' | 'z'; angle: number; rescale: boolean };
  shade: boolean;
  faces: Partial<Record<FaceName, Face>>;
}

export interface GuiTransform {
  rotation: Vec3; // graus
  translation: Vec3;
  scale: Vec3;
}

// ícone "chapado" (item/generated): camadas de textura empilhadas
export interface FlatModel {
  kind: 'flat';
  layers: { texture: string; tintIndex: number }[];
}

// ícone 3d: elementos (cubos) com transformação de gui
export interface BlockModel {
  kind: 'block';
  elements: Element[];
  gui: GuiTransform;
  light: 'side' | 'front';
}

// vários modelos sobrepostos (ex.: modelo "composite")
export interface CompositeModel {
  kind: 'composite';
  parts: IconModel[];
}

// transformação extra que a definição do item aplica antes de desenhar (translação · rotação esq. · escala · rotação dir.)
export interface LocalTransform {
  translation: Vec3;
  leftRotation: [number, number, number, number]; // quaternion x, y, z, w
  scale: Vec3;
  rightRotation: [number, number, number, number];
}

// desenhado pelo jogo com modelo de entidade (baú, estandarte, cabeça…). "key" identifica o modelo exportado
// pelo dumper (specials.json); "spec" é a definição crua, usada pra gerar esse arquivo
export interface SpecialModel {
  kind: 'special';
  type: string;
  key: string;
  spec: unknown;
  base?: string;
  transforms: LocalTransform[]; // da definição do item, do nó de fora pro de dentro (cada nó pode ter a sua)
}

// malha de quadrados em 0..16 (já com a transformação local), com transformação de gui do modelo base
export interface MeshQuad {
  texture: string;
  layer: number; // ordem da parte: camadas posteriores (padrões do estandarte) ficam por cima das coplanares
  tint: number; // argb, -1 = sem tint
  vertices: [Vec3, Vec3, Vec3, Vec3];
  uvs: [[number, number], [number, number], [number, number], [number, number]]; // 0..1
}

export interface MeshModel {
  kind: 'mesh';
  quads: MeshQuad[];
  gui: GuiTransform;
  light: 'side' | 'front';
}

export interface EmptyModel {
  kind: 'empty';
}

export type IconModel = FlatModel | BlockModel | MeshModel | CompositeModel | SpecialModel | EmptyModel;

// textura já decodificada (só o primeiro quadro, no caso das animadas)
export interface Texture {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // rgba
}

export type TextureLookup = (id: string) => Texture | undefined;
