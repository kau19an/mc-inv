// transforma "um item" no modelo de ícone que o renderizador entende, lendo os arquivos extraídos do jogo:
//   items/<id>.json (definição do item) → models/... (modelo + pais) → texturas, tints e transformação de gui
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { Element, Face, FaceName, GuiTransform, IconModel, Texture, Tint, Vec3 } from '../../../src/lib/icons/types.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const FACE_NAMES: FaceName[] = ['north', 'south', 'east', 'west', 'up', 'down'];
const IDENTITY_GUI: GuiTransform = { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] };

// "minecraft:block/oak_log" ou "block/oak_log" → "block/oak_log"
const path = (id: string) => id.replace(/^minecraft:/, '');

export interface ResolvedIcon {
  model: IconModel;
  tints: Tint[];
}

export class IconResolver {
  private models = new Map<string, Json | null>();
  private textures = new Map<string, Texture | null>();

  private root: string;
  private overlay: string | undefined;

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
  private pick(node: Json, tints: Tint[]): IconModel {
    const type = path(node.type ?? '');
    switch (type) {
      case 'model': {
        tints.splice(0, tints.length, ...(node.tints ?? []).map((source: Json) => this.tint(source)));
        return this.resolveModel(node.model);
      }
      case 'condition':
        // condições (usando o item, quebrado, pescando…) são falsas num inventário parado
        return this.pick(node.on_false, tints);
      case 'select': {
        if (path(node.property ?? '') === 'display_context') {
          const gui = (node.cases ?? []).find((entry: Json) => [entry.when].flat().includes('gui'));
          if (gui) return this.pick(gui.model, tints);
        }
        return this.pick(node.fallback ?? node.cases?.[0]?.model, tints);
      }
      case 'range_dispatch':
        // bússola, relógio, arco puxado…: o estado "parado"
        return this.pick(node.fallback ?? node.entries?.[0]?.model, tints);
      case 'composite':
        return { kind: 'composite', parts: (node.models ?? []).map((part: Json) => this.pick(part, tints)) };
      case 'special':
        return { kind: 'special', type: path(node.model?.type ?? 'unknown'), base: node.base };
      default:
        return { kind: 'empty' };
    }
  }

  // cor de um tint da definição do item. componentes (cor tingida, poção…) entram depois; por ora, o padrão
  private tint(source: Json): Tint {
    switch (path(source.type ?? '')) {
      case 'constant':
        return source.value;
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
      if (key === 'builtin/entity') return { kind: 'special', type: 'builtin_entity' };
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

  resolve(itemId: string): ResolvedIcon {
    const definition = this.readJson(join(this.root, 'assets/minecraft/items', `${path(itemId)}.json`));
    const tints: Tint[] = [];
    if (!definition?.model) return { model: { kind: 'empty' }, tints };
    return { model: this.pick(definition.model, tints), tints };
  }
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
