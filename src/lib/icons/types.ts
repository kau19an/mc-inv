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

// renderizado pelo jogo com modelo de entidade (baú, cama, estandarte, cabeça…): tratado à parte
export interface SpecialModel {
  kind: 'special';
  type: string;
  base?: string;
}

export interface EmptyModel {
  kind: 'empty';
}

export type IconModel = FlatModel | BlockModel | CompositeModel | SpecialModel | EmptyModel;

// textura já decodificada (só o primeiro quadro, no caso das animadas)
export interface Texture {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // rgba
}

export type TextureLookup = (id: string) => Texture | undefined;
