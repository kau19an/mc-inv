// pacote de ícones de uma versão (public/data/je/<versão>/icons.json + atlas) e a ponte até o renderizador.
// funciona no navegador e no node: quem chama entrega os pixels do atlas já decodificados
import type { IconModel, Texture, TextureLookup, Tint } from './types.ts';

// posição de uma textura no atlas: [x, y, largura, altura]
export type AtlasRect = [number, number, number, number];

export interface IconBundle {
  models: IconModel[]; // deduplicados; texturas sem o "minecraft:"
  items: Record<string, [number] | [number, Tint[]]>; // id do item → [índice do modelo, tints?]
  textures: Record<string, AtlasRect>; // textures.png
  programmerTextures: Record<string, AtlasRect>; // textures-programmer.png (só o que muda)
}

// pixels de um atlas (ImageData no navegador, png decodificado no node)
export interface AtlasPixels {
  width: number;
  data: Uint8ClampedArray | Uint8Array;
}

// recorta cada textura do atlas na primeira vez que ela é pedida e guarda o recorte
function atlasLookup(rects: Record<string, AtlasRect>, pixels: AtlasPixels): (id: string) => Texture | undefined {
  const cache = new Map<string, Texture>();
  return (id) => {
    const cached = cache.get(id);
    if (cached) return cached;
    const rect = rects[id];
    if (!rect) return undefined;
    const [x, y, width, height] = rect;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      const start = ((y + row) * pixels.width + x) * 4;
      data.set(pixels.data.subarray(start, start + width * 4), row * width * 4);
    }
    const texture = { width, height, data };
    cache.set(id, texture);
    return texture;
  };
}

// lookup de texturas pro renderizador: com o programmer art ligado, procura nele primeiro (como o jogo faz)
export function createTextureLookup(bundle: IconBundle, atlas: AtlasPixels, programmerAtlas?: AtlasPixels): TextureLookup {
  const current = atlasLookup(bundle.textures, atlas);
  const old = programmerAtlas ? atlasLookup(bundle.programmerTextures, programmerAtlas) : null;
  return (id) => {
    const key = id.replace(/^minecraft:/, '');
    return old?.(key) ?? current(key);
  };
}

export function iconFor(bundle: IconBundle, itemId: string): { model: IconModel; tints: Tint[] } | undefined {
  // variantes ("enchanted_book~c3344c57") sem ícone próprio usam o do item base
  const key = itemId.replace(/^minecraft:/, '');
  const entry = bundle.items[key] ?? bundle.items[key.split('~')[0]!];
  if (!entry) return undefined;
  return { model: bundle.models[entry[0]]!, tints: entry[1] ?? [] };
}
