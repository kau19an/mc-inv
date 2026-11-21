// npm run data — baixa e extrai os arquivos do jogo para .cache/versions/<id>/
//
// opções:
//   --source=official|mirror   de onde vêm os arquivos (padrão: official; mirror é só para desenvolvimento)
//   --versions=tracked|<ids>   "tracked" = última release + último snapshot; ou ids separados por vírgula
//   --locales=all|<locales>    idiomas a baixar (padrão: all), ex.: --locales=en_us,pt_br
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { unzipSync } from 'fflate';
import { CACHE_DIR, writeFileDeep } from './lib/files.ts';
import { trackedIds, withKind, type Version } from './lib/versions.ts';
import { official } from './sources/official.ts';
import { mirror } from './sources/mirror.ts';
import type { Locales, Source } from './sources/types.ts';

const { values: args } = parseArgs({
  options: {
    source: { type: 'string', default: process.env.MC_DATA_SOURCE ?? 'official' },
    versions: { type: 'string', default: 'tracked' },
    locales: { type: 'string', default: 'all' },
  },
});

const sources: Record<string, Source> = { official, mirror };
const source = sources[args.source];
if (!source) throw new Error(`fonte desconhecida: ${args.source} (use official ou mirror)`);
const locales: Locales = args.locales === 'all' ? 'all' : args.locales.split(',').map((locale) => locale.trim().toLowerCase());

// conta arquivos de uma pasta (recursivo), para o resumo
async function countFiles(dir: string): Promise<number> {
  try {
    return (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).length;
  } catch {
    return 0;
  }
}

async function extractVersion(version: Version) {
  const outDir = join(CACHE_DIR, 'versions', version.id);
  await rm(outDir, { recursive: true, force: true });
  const { programmerArt } = await source!.extract(version, outDir, locales);

  // o programmer art vira uma pasta própria, no mesmo layout (assets/minecraft/textures/…)
  if (programmerArt) {
    const entries = unzipSync(programmerArt, { filter: (file) => file.name.startsWith('assets/') });
    for (const [name, data] of Object.entries(entries)) {
      if (!name.endsWith('/')) await writeFileDeep(join(outDir, 'programmer_art', name), data);
    }
  }

  const assets = join(outDir, 'assets/minecraft');
  const data = join(outDir, 'data/minecraft');
  const meta = {
    id: version.id,
    kind: version.kind,
    releaseTime: version.releaseTime,
    source: source!.name,
    extractedAt: new Date().toISOString(),
    counts: {
      textures: await countFiles(join(assets, 'textures')),
      models: await countFiles(join(assets, 'models')),
      items: await countFiles(join(assets, 'items')),
      blockstates: await countFiles(join(assets, 'blockstates')),
      langs: await countFiles(join(assets, 'lang')),
      recipes: (await countFiles(join(data, 'recipe'))) + (await countFiles(join(data, 'recipes'))),
      itemTags: (await countFiles(join(data, 'tags/item'))) + (await countFiles(join(data, 'tags/items'))),
      programmerArtTextures: await countFiles(join(outDir, 'programmer_art/assets/minecraft/textures')),
    },
  };
  await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

const list = await source.listVersions();
const all = list.versions.map(withKind);
await writeFileDeep(
  join(CACHE_DIR, 'versions.json'),
  JSON.stringify({ source: source.name, latest: list.latest, versions: all.map(({ id, kind, releaseTime }) => ({ id, kind, releaseTime })) }, null, 2),
);

const wanted = args.versions === 'tracked' ? trackedIds(list) : args.versions.split(',').map((id) => id.trim());
console.log(`fonte: ${source.name} · versões: ${wanted.join(', ')} · idiomas: ${locales === 'all' ? 'todos' : locales.join(', ')}`);

for (const id of wanted) {
  const version = all.find((v) => v.id === id);
  if (!version) throw new Error(`versão não encontrada no manifesto: ${id}`);
  const started = Date.now();
  const meta = await extractVersion(version);
  console.log(`\n✓ ${id} (${meta.kind}) em ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.table(meta.counts);
}
