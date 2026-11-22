// node scripts/data/publish.ts — etapa "Publicar" do data.yml: junta o que os grupos geraram com o que já estava
// publicado e escreve:
//   .cache/publish/versions.json   lista de versões do site (vai pra <bucket>/je/versions.json)
//   .cache/publish/_builds.json    controle do CI: lote e pipeline de cada versão (vai pra <bucket>/je/_builds.json)
//   .cache/publish/_failures.json  versões que falharam e com qual pipeline (vai pra <bucket>/je/_failures.json)
//   .cache/publish/_retired.json   lotes substituídos, com a data (vai pra <bucket>/je/_retired.json)
//   .cache/publish/delete.txt      lotes substituídos há mais de um dia, a apagar do bucket (um prefixo por linha)
//   src/data/mc-inv-index.json     índice do site pras páginas estáticas (vai pro repositório)
//
// lê: .cache/versions.json (lista da Mojang), <DATA_URL>/je/_builds.json e os resultados dos grupos
//     (.cache/results/*.json: { lot, pipeline, ids }), e o index.json de cada versão publicada (no bucket)
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from './lib/files.ts';
import type { VersionKind } from './lib/versions.ts';
import { assignDrops } from '../../src/lib/gui/drops.ts';
import { publishedBuilds, publishedFailures, type Builds } from './plan.ts';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(CACHE_DIR, 'publish');
const SITE_INDEX = join(ROOT, 'src/data/mc-inv-index.json');
const dataUrl = process.env.DATA_URL;
if (!dataUrl) throw new Error('DATA_URL não definida (ex.: https://mc-data.faariaz.com)');

interface VersionIndex {
  id: string;
  tabs: { id: string; pt: string; en: string }[];
  items: Record<string, { pt: string; en: string }>;
  // itens sem ícone e tamanho da malha de cada modelo especial (-1 = erro). lotes antigos não têm
  health?: { blankIcons: string[]; specials: Record<string, number> };
}

const catalog = JSON.parse(await readFile(join(CACHE_DIR, 'versions.json'), 'utf8')) as {
  latest: { release: string; snapshot: string };
  versions: { id: string; kind: VersionKind; releaseTime: string }[];
};
const previous = await publishedBuilds(dataUrl);
const builds: Builds = { ...previous };
const failures = await publishedFailures(dataUrl);
const replaced: string[] = [];
// lote antigo só é apagado um dia depois de substituído: quem abriu o site antes ainda tem a lista velha em
// cache (5 minutos) ou a página aberta, e continua carregando dele sem erro
const RETIRE_AFTER_MS = 24 * 60 * 60 * 1000;

// resultados dos grupos (artefatos do actions)
const resultsDir = join(CACHE_DIR, 'results');
for (const file of existsSync(resultsDir) ? await readdir(resultsDir) : []) {
  if (!file.endsWith('.json')) continue;
  const result = JSON.parse(await readFile(join(resultsDir, file), 'utf8')) as { lot: string; pipeline: string; ids: string[]; failed?: string[] };
  for (const id of result.failed ?? []) failures[id] = result.pipeline;
  for (const id of result.ids) {
    delete failures[id];
    const path = `je/${id}/${result.lot}`;
    const old = previous[id];
    if (old && old.path !== path) replaced.push(`${old.path}/`);
    builds[id] = { lot: result.lot, pipeline: result.pipeline, path, builtAt: new Date().toISOString() };
  }
}

// lista de versões do site: só as publicadas, na ordem da Mojang (mais nova primeiro)
// drop de cada versão pela lista inteira (snapshots semanais da 1.21.x vão pro drop da versão numerada seguinte)
const drops = assignDrops(catalog.versions);
const versions = catalog.versions.filter((version) => builds[version.id]).map(({ id, kind, releaseTime }) => ({ id, kind, releaseTime, drop: drops.get(id)!, path: builds[id]!.path }));
const pick = (id: string) => (builds[id] ? id : null);
const releasedDrops = [...new Set(catalog.versions.filter((version) => version.kind === 'release').map((version) => drops.get(version.id)!))];
const latestRelease = pick(catalog.latest.release) ?? versions.find((version) => version.kind === 'release')?.id ?? versions[0]?.id ?? null;
const list = { latest: { release: latestRelease, snapshot: pick(catalog.latest.snapshot) }, versions, releasedDrops };

// índice do site: abas da release mais recente + itens de todas as versões (a release tem prioridade nos nomes;
// as outras, da mais nova pra mais antiga, só acrescentam os itens que faltam)
const indexOf = async (id: string): Promise<VersionIndex> => {
  const response = await fetch(`${dataUrl}/${builds[id]!.path}/index.json`);
  if (!response.ok) throw new Error(`falha ao ler o index.json de ${id} (${response.status})`);
  return (await response.json()) as VersionIndex;
};
const order = [latestRelease, ...versions.map((version) => version.id).filter((id) => id !== latestRelease)].filter((id): id is string => Boolean(id));
const indexes = await Promise.all(order.map(indexOf));
const items: VersionIndex['items'] = {};
for (const index of indexes) for (const [id, names] of Object.entries(index.items)) items[id] ??= names;
const siteIndex = { release: latestRelease, tabs: indexes[0]?.tabs ?? [], items: Object.fromEntries(Object.entries(items).sort(([a], [b]) => (a < b ? -1 : 1))) };

const retiredResponse = await fetch(`${dataUrl}/je/_retired.json`, { cache: 'no-store' });
const retired = retiredResponse.ok ? ((await retiredResponse.json()) as { prefix: string; retiredAt: string }[]) : [];
const now = Date.now();
const live = new Set(Object.values(builds).map((build) => `${build.path}/`));
const due = retired.filter((entry) => now - Date.parse(entry.retiredAt) >= RETIRE_AFTER_MS && !live.has(entry.prefix));
const keep = retired.filter((entry) => !due.includes(entry) && !live.has(entry.prefix));
for (const prefix of replaced) if (!keep.some((entry) => entry.prefix === prefix)) keep.push({ prefix, retiredAt: new Date(now).toISOString() });

// saúde dos ícones entre versões: algo que aparece numa versão e some em outra quase sempre é o pipeline que não
// entendeu a api daquela época (ex.: o vaso decorado da 26.1, desenhado com submitModelPart), não o jogo
const byId = new Map(indexes.map((index) => [index.id, index]));
const chronological = [...versions].reverse().map((version) => byId.get(version.id)).filter((index): index is VersionIndex => Boolean(index?.health));
const problems: string[] = [];
const specialKeys = new Set(chronological.flatMap((index) => Object.keys(index.health!.specials)));
for (const key of specialKeys) {
  const counts = chronological.filter((index) => key in index.health!.specials).map((index) => [index.id, index.health!.specials[key]!] as const);
  const broken = counts.filter(([, quads]) => quads <= 0).map(([id]) => id);
  if (broken.length && broken.length < counts.length) problems.push(`- modelo especial ${key}: vazio em ${broken.join(', ')}`);
}
const rendered = new Map<string, number>(); // item → em quantas versões ele tem ícone
for (const index of chronological) {
  const blank = new Set(index.health!.blankIcons);
  for (const key of Object.keys(index.items)) if (!blank.has(key)) rendered.set(key, (rendered.get(key) ?? 0) + 1);
}
const blankIn = new Map<string, string[]>();
for (const index of chronological) for (const key of index.health!.blankIcons) if (rendered.get(key)) (blankIn.get(key) ?? blankIn.set(key, []).get(key)!).push(index.id);
for (const [key, ids] of blankIn) problems.push(`- item ${key}: sem ícone em ${ids.join(', ')} (nas outras versões tem)`);

await mkdir(OUT, { recursive: true });
await writeFile(
  join(OUT, 'health.md'),
  problems.length
    ? `# ${problems.length} diferença(s) entre versões\n\nCada linha é algo que existe em algumas versões e some em outras.\n\n${problems.join('\n')}\n`
    : `# Tudo certo\n\n${chronological.length} versões comparadas: nenhum ícone ou modelo especial some de uma versão pra outra.\n`,
);
for (const problem of problems.slice(0, 10)) console.log(`::warning title=Ícone diferente entre versões::${problem.slice(2)}`);
await mkdir(join(ROOT, 'src/data'), { recursive: true });
await writeFile(join(OUT, 'versions.json'), JSON.stringify(list));
await writeFile(join(OUT, '_builds.json'), JSON.stringify(builds));
await writeFile(join(OUT, '_failures.json'), JSON.stringify(failures));
await writeFile(join(OUT, '_retired.json'), JSON.stringify(keep));
await writeFile(join(OUT, 'delete.txt'), due.map((entry) => `${entry.prefix}\n`).join(''));
await writeFile(SITE_INDEX, `${JSON.stringify(siteIndex, null, 2)}\n`);
console.log(`${Object.keys(failures).length} versões com falha registrada · ${problems.length} diferenças de ícones entre versões · ${versions.length} versões publicadas · ${Object.keys(siteIndex.items).length} itens no índice · ${due.length} lotes antigos apagados agora, ${keep.length} na espera`);
