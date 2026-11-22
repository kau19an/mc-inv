// transforma "um item" no modelo de ícone que o renderizador entende, lendo os arquivos extraídos do jogo:
//   items/<id>.json (definição do item) → models/... (modelo + pais) → texturas, tints e transformação de gui
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { Element, Face, FaceName, GuiTransform, IconModel, LocalTransform, MeshQuad, SpecialModel, Texture, Tint, Vec3 } from '../../../src/lib/icons/types.ts';
import { applyLocalChain } from '../../../src/lib/icons/transform.ts';
import legacyTints from './legacy-tints.json' with { type: 'json' };

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const FACE_NAMES: FaceName[] = ['north', 'south', 'east', 'west', 'up', 'down'];
const IDENTITY_GUI: GuiTransform = { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] };

// "minecraft:block/oak_log" ou "block/oak_log" → "block/oak_log"
const path = (id: string) => id.replace(/^minecraft:/, '');

// geometria exportada pelo dumper (SpecialModelsDump): por definição de modelo especial, as partes desenhadas
export interface SpecialMeshes {
  [key: string]: { error?: string; parts?: { texture?: string; renderType: string; tint: number; quads: [number, number, number, number, number][][] }[] };
}

export interface ResolvedIcon {
  model: IconModel;
  tints: Tint[];
}

// o que muda o ícone de uma variante: os componentes da pilha (block_state da luz…) e a cor da poção (calculada
// pelo próprio jogo no dumper, porque depende dos efeitos)
export interface StackContext {
  components?: Record<string, unknown>;
  potionColor?: number;
  tintColors?: number[]; // cores por camada calculadas pelo jogo (ovos de geração antigos)
}

export class IconResolver {
  private context: StackContext = {};
  private models = new Map<string, Json | null>();
  private textures = new Map<string, Texture | null>();

  private root: string;
  private overlay: string | undefined;
  meshes: SpecialMeshes = {};

  // root: pasta da versão extraída (.cache/versions/<id>); overlay: pasta do programmer art, se for esse o pacote
  constructor(root: string, overlay?: string) {
    this.root = root;
    this.overlay = overlay;
  }

  private readJson(file: string): Json | null {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Json) : null;
  }

  private model(id: string): Json | null {
    const key = path(id);
    if (!this.models.has(key)) this.models.set(key, this.readJson(join(this.root, 'assets/minecraft/models', `${key}.json`)));
    return this.models.get(key)!;
  }

  // textura decodificada (do programmer art, se existir lá; senão a atual). animadas: só o primeiro quadro
  texture = (id: string): Texture | undefined => {
    const key = path(id);
    if (!this.textures.has(key)) {
      const candidates = [this.overlay, this.root].filter(Boolean).map((base) => join(base!, 'assets/minecraft/textures', `${key}.png`));
      const file = candidates.find((candidate) => existsSync(candidate));
      this.textures.set(key, file ? decodeFirstFrame(file) : null);
    }
    return this.textures.get(key) ?? undefined;
  };

  // escolhe, na definição do item, o "galho" que a gui mostra
  // transforms: transformações dos nós de fora já percorridos (qualquer nó pode ter "transformation", ex.: escudo)
  private pick(node: Json, tints: Tint[], outer: LocalTransform[] = []): IconModel {
    const type = path(node.type ?? '');
    const own = localTransform(node.transformation);
    const transforms = own ? [...outer, own] : outer;
    switch (type) {
      case 'model': {
        tints.splice(0, tints.length, ...(node.tints ?? []).map((source: Json) => this.tint(source)));
        const model = this.resolveModel(node.model);
        // modelo de bloco com "transformation" no caminho (ex.: o pé da cama, 1 bloco pra trás da cabeceira)
        return model.kind === 'block' && transforms.length ? { ...model, local: transforms } : model;
      }
      case 'condition':
        // condições (usando o item, quebrado, pescando…) são falsas num inventário parado
        return this.pick(node.on_false, tints, transforms);
      case 'select': {
        const property = path(node.property ?? '');
        if (property === 'display_context') {
          const gui = (node.cases ?? []).find((entry: Json) => [entry.when].flat().includes('gui'));
          if (gui) return this.pick(gui.model, tints, transforms);
        }
        // estado de bloco guardado no item (ex.: o nível da luz, de 0 a 15; o modo do bloco de teste)
        if (property === 'block_state') {
          const state = this.context.components?.['minecraft:block_state'] as Record<string, string> | undefined;
          const value = state?.[node.block_state_property];
          const match = value === undefined ? undefined : (node.cases ?? []).find((entry: Json) => [entry.when].flat().map(String).includes(String(value)));
          if (match) return this.pick(match.model, tints, transforms);
        }
        return this.pick(node.fallback ?? node.cases?.[0]?.model, tints, transforms);
      }
      case 'range_dispatch':
        // bússola, relógio, arco puxado…: o estado "parado"
        return this.pick(node.fallback ?? node.entries?.[0]?.model, tints, transforms);
      case 'composite':
        return { kind: 'composite', parts: (node.models ?? []).map((part: Json) => this.pick(part, tints, transforms)) };
      case 'special':
        return {
          kind: 'special',
          type: path(node.model?.type ?? 'unknown'),
          key: stableKey(node.model),
          spec: node.model,
          base: node.base,
          transforms,
        };
      default:
        return { kind: 'empty' };
    }
  }

  // cor de um tint da definição do item. poção: a cor que o jogo calculou pros efeitos (opaca, como o
  // ItemTintSource "potion"); sem efeito, o padrão. outros componentes (cor tingida…) ainda usam o padrão
  private tint(source: Json): Tint {
    switch (path(source.type ?? '')) {
      case 'constant':
        return source.value;
      case 'potion':
        return this.context.potionColor === undefined ? (source.default ?? -1) : (0xff << 24) | (this.context.potionColor & 0xffffff);
      case 'grass':
        return this.colormap('grass', source.temperature, source.downfall);
      default:
        return source.default ?? -1;
    }
  }

  // mesma conta do jogo pra cor da grama/folhagem a partir de temperatura e umidade
  private colormap(name: string, temperature: number, downfall: number): Tint {
    const map = this.texture(`minecraft:colormap/${name}`);
    if (!map) return -1;
    const t = Math.min(1, Math.max(0, temperature));
    const d = Math.min(1, Math.max(0, downfall)) * t;
    const x = Math.floor((1 - t) * (map.width - 1));
    const y = Math.floor((1 - d) * (map.height - 1));
    const i = (y * map.width + x) * 4;
    return (0xff << 24) | (map.data[i]! << 16) | (map.data[i + 1]! << 8) | map.data[i + 2]!;
  }

  // segue a cadeia de pais do modelo juntando texturas, elementos e transformação de gui
  private resolveModel(id: string): IconModel {
    const textures: Record<string, string> = {};
    let elements: Json[] | undefined;
    let gui: Json | undefined;
    let light: 'side' | 'front' | undefined;
    let generated = false;
    let current: string | undefined = id;
    for (let depth = 0; current && depth < 20; depth++) {
      const key = path(current);
      if (key === 'builtin/generated') {
        generated = true;
        break;
      }
      if (key === 'builtin/entity') return { kind: 'special', type: 'builtin_entity', key: 'builtin_entity', spec: null, transforms: [] };
      const json = this.model(current);
      if (!json) break;
      // a textura pode vir como texto ou como objeto ({ "sprite": "…", "force_translucent": true }, nos vidros)
      for (const [name, value] of Object.entries(json.textures ?? {})) {
        if (!(name in textures)) textures[name] = typeof value === 'string' ? value : (value as Json).sprite;
      }
      elements ??= json.elements;
      gui ??= json.display?.gui;
      light ??= json.gui_light;
      current = json.parent;
    }

    // "#side" → "#all" → "minecraft:block/stone". nas faces, a referência às vezes vem sem o "#" ("texture": "all")
    const resolveTexture = (ref: string): string | undefined => {
      let value: string | undefined = !ref.startsWith('#') && ref in textures ? `#${ref}` : ref;
      for (let i = 0; value?.startsWith('#') && i < 10; i++) value = textures[value.slice(1)];
      return value?.startsWith('#') ? undefined : value;
    };

    if (!elements && generated) {
      const layers = Object.keys(textures)
        .filter((name) => /^layer\d+$/.test(name))
        .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
        .map((name) => ({ texture: resolveTexture(textures[name]!)!, tintIndex: Number(name.slice(5)) }))
        .filter((layer) => layer.texture);
      return { kind: 'flat', layers };
    }
    if (!elements) return { kind: 'empty' };

    const resolved: Element[] = elements.map((element) => {
      const faces: Partial<Record<FaceName, Face>> = {};
      for (const name of FACE_NAMES) {
        const face = element.faces?.[name];
        if (!face) continue;
        const texture = resolveTexture(face.texture);
        if (!texture) continue;
        faces[name] = {
          texture,
          uv: face.uv ?? defaultUv(name, element.from, element.to),
          rotation: (face.rotation ?? 0) as Face['rotation'],
          tintIndex: face.tintindex ?? -1,
        };
      }
      return {
        from: element.from,
        to: element.to,
        rotation: element.rotation
          ? { origin: element.rotation.origin, axis: element.rotation.axis, angle: element.rotation.angle, rescale: element.rotation.rescale ?? false }
          : undefined,
        shade: element.shade ?? true,
        faces,
      };
    });

    return {
      kind: 'block',
      elements: resolved,
      gui: gui ? { rotation: gui.rotation ?? [0, 0, 0], translation: gui.translation ?? [0, 0, 0], scale: gui.scale ?? [1, 1, 1] } : IDENTITY_GUI,
      light: light ?? 'side',
    };
  }

  // transformação de gui e luz de um modelo (seguindo os pais), sem precisar de elementos (ex.: item/chest)
  private guiOf(id: string): { gui: GuiTransform; light: 'side' | 'front' } {
    let gui: Json | undefined;
    let light: 'side' | 'front' | undefined;
    let current: string | undefined = id;
    for (let depth = 0; current && depth < 20; depth++) {
      const json = this.model(current);
      if (!json) break;
      gui ??= json.display?.gui;
      light ??= json.gui_light;
      current = json.parent;
    }
    return {
      gui: gui ? { rotation: gui.rotation ?? [0, 0, 0], translation: gui.translation ?? [0, 0, 0], scale: gui.scale ?? [1, 1, 1] } : IDENTITY_GUI,
      light: light ?? 'side',
    };
  }

  // modelo especial → malha: geometria do jogo (em blocos) · transformação local do item · ×16 (escala dos modelos de bloco)
  private toMesh(special: SpecialModel): IconModel {
    const mesh = this.meshes[special.key];
    if (!mesh?.parts) return special;
    const { gui, light } = special.base ? this.guiOf(special.base) : { gui: IDENTITY_GUI, light: 'side' as const };
    // composição como no jogo (pai · filho): o ponto passa primeiro pela transformação mais de dentro
    const transform = (point: Vec3) => applyLocalChain(special.transforms, point);
    const quads: MeshQuad[] = [];
    mesh.parts.forEach((part, layer) => {
      const texture = part.texture ?? textureFromRenderType(part.renderType);
      if (!texture) return;
      for (const quad of part.quads) {
        if (quad.length !== 4) continue;
        const vertices = quad.map(([x, y, z]) => transform([x, y, z]).map((value) => value * 16) as Vec3) as MeshQuad['vertices'];
        const uvs = quad.map(([, , , u, v]) => [u, v] as [number, number]) as MeshQuad['uvs'];
        quads.push({ texture, layer, tint: part.tint, vertices, uvs });
      }
    });
    return { kind: 'mesh', quads, gui, light };
  }

  // versões sem as definições de item (antes da 24w45a): o modelo era sempre models/item/<id>.json, e as cores
  // (grama, folhas, couro, poção…) vinham do código do jogo. as cores saem de legacy-tints.json, copiadas das
  // definições de uma versão nova (as regras não mudaram pra esses itens)
  private legacyDefinition(itemId: string): Json | null {
    if (existsSync(join(this.root, 'assets/minecraft/items'))) return null;
    const id = path(itemId);
    // itens desenhados por código naquela época: a definição da versão de referência (dump.ts, REFERENCE_ID)
    const borrowed = this.readJson(join(this.root, 'legacy-items', `${id}.json`));
    if (borrowed) return borrowed;
    const tints = this.context.tintColors?.map((value) => ({ type: 'minecraft:constant', value: value | (0xff << 24) })) ?? (legacyTints as Record<string, Json[]>)[id];
    return { model: { type: 'minecraft:model', model: `minecraft:item/${id}`, tints } };
  }

  resolve(itemId: string, context: StackContext = {}): ResolvedIcon {
    this.context = context;
    const definition = this.readJson(join(this.root, 'assets/minecraft/items', `${path(itemId)}.json`)) ?? this.legacyDefinition(itemId);
    const tints: Tint[] = [];
    if (!definition?.model) return { model: { kind: 'empty' }, tints };
    const toMeshes = (model: IconModel): IconModel =>
      model.kind === 'special' ? this.toMesh(model) : model.kind === 'composite' ? { ...model, parts: model.parts.map(toMeshes) } : model;
    return { model: toMeshes(this.pick(definition.model, tints)), tints };
  }
}

// cabeças e estátuas não usam sprite de atlas: a textura vem dentro do "render type" (ex.: "minecraft:textures/entity/skeleton/skeleton.png")
function textureFromRenderType(renderType: string): string | undefined {
  const match = /([a-z0-9_.-]+):textures\/([a-z0-9_/.-]+)\.png/.exec(renderType);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

// chave estável de um modelo especial: o mesmo json sempre vira a mesma chave
export function stableKey(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])) : v;
  return JSON.stringify(sort(value));
}

function localTransform(json: Json | undefined): LocalTransform | undefined {
  if (!json) return undefined;
  return {
    translation: json.translation ?? [0, 0, 0],
    leftRotation: json.left_rotation ?? [0, 0, 0, 1],
    scale: json.scale ?? [1, 1, 1],
    rightRotation: json.right_rotation ?? [0, 0, 0, 1],
  };
}

// uv padrão de uma face quando o modelo não diz (depende do tamanho do elemento)
function defaultUv(face: FaceName, [x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): [number, number, number, number] {
  switch (face) {
    case 'south': return [x1, 16 - y2, x2, 16 - y1];
    case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'east': return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
    case 'west': return [z1, 16 - y2, z2, 16 - y1];
    case 'up': return [x1, z1, x2, z2];
    case 'down': return [x1, 16 - z2, x2, 16 - z1];
  }
}

// decodifica o png; se for animado (mais alto que largo), recorta o quadro indicado no .mcmeta (ou o primeiro)
function decodeFirstFrame(file: string): Texture {
  const png = PNG.sync.read(readFileSync(file));
  if (png.height <= png.width) return { width: png.width, height: png.height, data: png.data };
  let frame = 0;
  const meta = `${file}.mcmeta`;
  if (existsSync(meta)) {
    const first = JSON.parse(readFileSync(meta, 'utf8'))?.animation?.frames?.[0];
    frame = typeof first === 'number' ? first : (first?.index ?? 0);
  }
  const side = png.width;
  const start = frame * side * side * 4;
  return { width: side, height: side, data: png.data.subarray(start, start + side * side * 4) };
}
