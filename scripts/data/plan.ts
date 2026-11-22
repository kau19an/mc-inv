// node scripts/data/plan.ts — decide quais versões o CI precisa gerar (etapa "Planejar" do data.yml).
//
// uma versão do histórico (drops com nome, 1.21.2 em diante) entra na fila se ainda não foi gerada ou se foi gerada
// com outro pipeline — e não falhou com este mesmo pipeline. o "pipeline" é o hash dos arquivos que geram os dados: mudou o código, muda o hash, e as versões são
// geradas de novo num lote novo (caminho novo no R2, então o cache dos navegadores nunca mistura lotes).
//
// lê:  .cache/versions.json (npm run data -- --versions=none) e <DATA_URL>/je/_builds.json (o que já foi publicado)
// opções:
//   --versions=<ids>   gera essas mesmo que já estejam em dia (ex.: pra tentar de novo uma que falhou)
//   --shards=<n>       em quantos grupos dividir a fila (padrão: 10, um computador do GitHub por grupo)
// saída (no $GITHUB_OUTPUT, ou no terminal): pipeline, lot, count, shards (lista de grupos de ids, em json) e probe
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { CACHE_DIR } from './lib/files.ts';
import { historyIds } from './lib/versions.ts';

const ROOT = join(import.meta.dirname, '../..');

// arquivos que mudam o resultado do build-data (os mesmos que disparam o workflow)
const PIPELINE_PATHS = ['scripts/data', 'src/lib/icons', 'src/lib/gui/types.ts', 'src/lib/gui/ui-keys.ts', 'src/lib/gui/wiki.ts', 'src/lib/gui/drops.ts', 'package-lock.json'];
const IGNORED = new Set(['scripts/data/probe-classes.txt']);
// arquivos que mudam o resultado do dump (abrir o jogo de cada versão: a parte lenta). mexer só no build-data
// (ícones, interface, json do site) não muda esse hash, e o CI reaproveita os dumps já feitos (je/_dumps no R2)
const DUMP_PATHS = ['scripts/data/dumper', 'scripts/data/dump.ts', 'scripts/data/lib', 'scripts/data/sources', 'scripts/data/icons/resolve.ts', 'scripts/data/icons/legacy-tints.json', 'package-lock.json'];

export interface BuildRecord {
  lot: string; // primeiros 12 caracteres do hash do pipeline
  pipeline: string;
  path: string; // "je/<id>/<lot>" no bucket
  builtAt: string;
}
export type Builds = Record<string, BuildRecord>;

async function filesOf(path: string): Promise<string[]> {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  if (!(await stat(full)).isDirectory()) return [path];
  const entries = await readdir(full, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(ROOT, join(entry.parentPath, entry.name)));
}

export async function pipelineHash(paths = PIPELINE_PATHS): Promise<string> {
  const files = (await Promise.all(paths.map(filesOf))).flat().filter((file) => !IGNORED.has(file)).sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update('\0').update(await readFile(join(ROOT, file))).update('\0');
  return hash.digest('hex');
}

// arquivo de controle publicado no bucket (je/<name>); ausente (primeira publicação) = vazio
export async function publishedControl<T>(dataUrl: string | undefined, name: string, empty: T): Promise<T> {
  if (!dataUrl) return empty;
  const response = await fetch(`${dataUrl}/je/${name}`, { cache: 'no-store' });
  if (response.status === 404 || response.status === 403) return empty;
  if (!response.ok) throw new Error(`falha ao ler ${name} (${response.status})`);
  return (await response.json()) as T;
}
export const publishedBuilds = (dataUrl: string | undefined) => publishedControl<Builds>(dataUrl, '_builds.json', {});
// versões que falharam e com qual pipeline: só voltam pra fila quando o pipeline muda (ou pedidas à mão)
export type Failures = Record<string, string>;
export const publishedFailures = (dataUrl: string | undefined) => publishedControl<Failures>(dataUrl, '_failures.json', {});

if (import.meta.main) {
  // 20 grupos: o máximo de computadores ao mesmo tempo no plano grátis do GitHub (repositório público)
  const { values: args } = parseArgs({ options: { versions: { type: 'string', default: '' }, shards: { type: 'string', default: '20' } } });
  const catalog = JSON.parse(await readFile(join(CACHE_DIR, 'versions.json'), 'utf8')) as { versions: { id: string; releaseTime: string }[] };
  const pipeline = await pipelineHash();
  const builds = await publishedBuilds(process.env.DATA_URL);
  const failures = await publishedFailures(process.env.DATA_URL);
  const history = new Set(historyIds(catalog.versions));
  // "tracked" (padrão do botão "rodar agora" da main) não força nada: a fila já pega o que é novo
  const forced = new Set(args.versions.split(',').map((id) => id.trim()).filter((id) => id && id !== 'tracked'));

  // modo de teste: um commit com "[só: 1.21.2, 24w45a]" na mensagem gera só essas versões (num lote do pipeline
  // novo); as outras continuam no lote anterior até o próximo commit sem a marca
  const only = /\[só:\s*([^\]]+)\]/i.exec(process.env.COMMIT_MESSAGE ?? '')?.[1]?.split(',').map((id) => id.trim()).filter(Boolean);

  // mais antigas primeiro: se o tempo acabar, as que faltarem são as mais novas, que o próximo agendamento pega
  const queue = catalog.versions
    .map((version) => version.id)
    .filter((id) => (only ? only.includes(id) : history.has(id) && (forced.has(id) || (builds[id]?.pipeline !== pipeline && failures[id] !== pipeline))))
    .reverse();
  if (only) console.log(`modo de teste: só ${only.join(', ')}`);

  // grupos do mesmo tamanho (no máximo --shards), alternando pra cada grupo ter versões de épocas variadas
  const count = Math.min(Number(args.shards) || 10, queue.length);
  const shards: string[][] = Array.from({ length: count }, () => []);
  queue.forEach((id, index) => shards[index % count]!.push(id));

  const output = {
    pipeline,
    lot: pipeline.slice(0, 12),
    dump: (await pipelineHash(DUMP_PATHS)).slice(0, 12),
    count: queue.length,
    shards: JSON.stringify(shards.map((ids) => ids.join(','))),
    // ferramenta de desenvolvimento: descompilar as classes listadas em probe-classes.txt
    probe: existsSync(join(ROOT, 'scripts/data/probe-classes.txt')),
  };
  console.log(`pipeline ${output.lot} · ${queue.length} versões na fila em ${count} grupos`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
  else console.log(output);
}
