// pacote de ícones que o navegador baixa (a fase 4 desenha os ícones com src/lib/icons a partir dele):
//   icons.json                modelos já resolvidos (deduplicados) + mapa item → modelo/tints + posição de cada textura nos atlas
//   textures.png              atlas com todas as texturas usadas (só o primeiro quadro das animadas)
//   textures-programmer.png   só as texturas que mudam no programmer art (o resto cai no atlas normal, como no jogo)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { IconModel, Texture, Tint } from '../../../src/lib/icons/types.ts';
import type { AtlasRect, IconBundle } from '../../../src/lib/icons/bundle.ts';
import { IconResolver, type SpecialMeshes } from './resolve.ts';

const ATLAS_WIDTH = 1024;

// "minecraft:block/oak_log" → "block/oak_log" (o namespace é sempre o mesmo e só ocupa espaço)
const shortId = (id: string) => id.replace(/^minecraft:/, '');

// arredonda números (vértices das malhas) pra encolher o json sem mudar o desenho
function compact(model: IconModel, rename: (texture: string) => string): IconModel {
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return JSON.parse(
    JSON.stringify(model, (key, value) => {
      if (typeof value === 'number') return round(value);
      if (key === 'texture' && typeof value === 'string') return rename(value);
      return value;
    }),
  ) as IconModel;
}

function collectTextures(model: IconModel, out: Set<string>): void {
  if (model.kind === 'flat') model.layers.forEach((layer) => out.add(layer.texture));
  else if (model.kind === 'block') model.elements.forEach((element) => Object.values(element.faces).forEach((face) => out.add(face!.texture)));
  else if (model.kind === 'mesh') model.quads.forEach((quad) => out.add(quad.texture));
  else if (model.kind === 'composite') model.parts.forEach((part) => collectTextures(part, out));
}

// empacota retângulos em "prateleiras" (do mais alto pro mais baixo): simples e eficiente pra texturas quadradas
function pack(textures: Map<string, Texture>): { rects: Record<string, AtlasRect>; png: PNG } {
  const entries = [...textures.entries()].sort(([a, ta], [b, tb]) => tb.height - ta.height || a.localeCompare(b));
  const rects: Record<string, AtlasRect> = {};
  let x = 0, y = 0, shelf = 0;
  for (const [id, texture] of entries) {
    if (x + texture.width > ATLAS_WIDTH) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    rects[id] = [x, y, texture.width, texture.height];
    x += texture.width;
    shelf = Math.max(shelf, texture.height);
  }
  const png = new PNG({ width: ATLAS_WIDTH, height: Math.max(1, y + shelf) });
  png.data.fill(0);
  for (const [id, texture] of entries) {
    const [rx, ry, w, h] = rects[id]!;
    for (let row = 0; row < h; row++) {
      png.data.set(texture.data.subarray(row * w * 4, (row + 1) * w * 4), ((ry + row) * ATLAS_WIDTH + rx) * 4);
    }
  }
  return { rects, png };
}

export interface BundleOutput {
  bundle: IconBundle;
  atlas: Buffer; // png; quem publica converte pra webp sem perdas (metade do tamanho)
  programmerAtlas: Buffer | null;
}

// png → webp sem perdas ("exact" mantém até a cor dos pixels transparentes)
export async function toWebp(png: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  return sharp(png).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
}

// versionDir: .cache/versions/<id> (arquivos extraídos); itemIds: itens que aparecem no inventário
export function buildIconBundle(versionDir: string, itemIds: string[], meshes: SpecialMeshes): BundleOutput {
  const resolver = new IconResolver(versionDir);
  resolver.meshes = meshes;
  const programmerDir = join(versionDir, 'programmer_art');
  const programmer = existsSync(programmerDir) ? new IconResolver(versionDir, programmerDir) : null;

  const models: IconModel[] = [];
  const modelIndex = new Map<string, number>();
  const items: IconBundle['items'] = {};
  const used = new Set<string>();

  for (const id of [...new Set(itemIds)].sort()) {
    const { model, tints } = resolver.resolve(id);
    collectTextures(model, used);
    const compacted = compact(model, shortId);
    const key = createHash('sha1').update(JSON.stringify(compacted)).digest('hex');
    let index = modelIndex.get(key);
    if (index === undefined) {
      index = models.push(compacted) - 1;
      modelIndex.set(key, index);
    }
    items[id] = tints.length ? [index, tints] : [index];
  }

  // texturas atuais + as do programmer art que são diferentes
  const current = new Map<string, Texture>();
  const changed = new Map<string, Texture>();
  for (const id of used) {
    const texture = resolver.texture(id);
    if (!texture) continue;
    current.set(shortId(id), texture);
    const old = programmer?.texture(id);
    if (old && (old.width !== texture.width || old.height !== texture.height || Buffer.compare(Buffer.from(old.data), Buffer.from(texture.data)) !== 0)) {
      changed.set(shortId(id), old);
    }
  }

  const atlas = pack(current);
  const programmerAtlas = changed.size ? pack(changed) : null;
  const bundle: IconBundle = {
    models,
    items,
    textures: atlas.rects,
    programmerTextures: programmerAtlas?.rects ?? {},
  };
  return { bundle, atlas: PNG.sync.write(atlas.png), programmerAtlas: programmerAtlas ? PNG.sync.write(programmerAtlas.png) : null };
}

// pra teste local: node scripts/data/icons/bundle.ts <versão>
if (import.meta.main) {
  const version = process.argv[2] ?? '26.3';
  const root = join(import.meta.dirname, '../../..');
  const data = join(root, 'public/data/je', version);
  const itemIds = Object.values(JSON.parse(readFileSync(join(data, 'items.json'), 'utf8')) as Record<string, { id: string }>).map((item) => item.id);
  const meshes = existsSync(join(data, 'specials.json')) ? (JSON.parse(readFileSync(join(data, 'specials.json'), 'utf8')) as SpecialMeshes) : {};
  const started = Date.now();
  const { bundle, atlas, programmerAtlas } = buildIconBundle(join(root, '.cache/versions', version), itemIds, meshes);
  const json = JSON.stringify(bundle);
  const { gzipSync, brotliCompressSync } = await import('node:zlib');
  console.log(`${Object.keys(bundle.items).length} itens → ${bundle.models.length} modelos únicos em ${Date.now() - started} ms`);
  console.log(`icons.json: ${(json.length / 1024).toFixed(0)} KB (gzip ${(gzipSync(json).length / 1024).toFixed(0)} KB, brotli ${(brotliCompressSync(json).length / 1024).toFixed(0)} KB)`);
  console.log(`textures.png: ${Object.keys(bundle.textures).length} texturas, ${(atlas.length / 1024).toFixed(0)} KB`);
  console.log(`textures-programmer.png: ${Object.keys(bundle.programmerTextures).length} texturas, ${((programmerAtlas?.length ?? 0) / 1024).toFixed(0)} KB`);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(join(root, '.cache/bundle'), { recursive: true });
  writeFileSync(join(root, '.cache/bundle/icons.json'), json);
  writeFileSync(join(root, '.cache/bundle/textures.png'), atlas);
  if (programmerAtlas) writeFileSync(join(root, '.cache/bundle/textures-programmer.png'), programmerAtlas);
}

export type { Tint };
