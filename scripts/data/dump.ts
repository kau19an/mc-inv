// npm run dump — monta as abas do inventário criativo usando o próprio jogo (precisa de java 25+)
// e grava em .cache/versions/<id>/creative_tabs.json. só funciona com a fonte oficial (precisa do jar).
//
// opções:
//   --versions=tracked|history|none|<ids>   igual ao npm run data
//   --keep-going               uma versão que falha não para as outras
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchBuffer } from './lib/http.ts';
import { CACHE_DIR, writeFileDeep } from './lib/files.ts';
import { reportFailure, selectIds, withKind, type Version } from './lib/versions.ts';
import { clientJar, official, versionPackage, type Library } from './sources/official.ts';
import { unzipSync } from 'fflate';
import { readableJar } from './lib/remap.ts';
import { IconResolver } from './icons/resolve.ts';
import type { IconModel, SpecialModel } from '../../src/lib/icons/types.ts';

const { values: args } = parseArgs({ options: { versions: { type: 'string', default: 'tracked' }, 'keep-going': { type: 'boolean', default: false } } });

const DUMPERS = ['DumpUtil.java', 'CreativeTabsDump.java', 'SpecialModelsDump.java', 'PlayerModelDump.java'].map((file) => join(import.meta.dirname, 'dumper', file));

// limite por comando: uma versão travada vira falha registrada, em vez de segurar o grupo até o limite do job
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

// roda um comando; se falhar, publica o fim da saída de erro como anotação do github actions
// (é o único jeito do claude ler o erro, já que ele não acessa os logs)
function run(command: string, commandArgs: string[], cwd?: string) {
  try {
    execFileSync(command, commandArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: COMMAND_TIMEOUT_MS, killSignal: 'SIGKILL' });
  } catch (error) {
    const timedOut = (error as { code?: string; signal?: string }).code === 'ETIMEDOUT' || (error as { signal?: string }).signal === 'SIGKILL';
    const output = (timedOut ? `tempo esgotado (${COMMAND_TIMEOUT_MS / 60000} min)\n` : '') + String((error as { stderr?: Buffer }).stderr ?? '') + String((error as { stdout?: Buffer }).stdout ?? '');
    const tail = output.trim().split('\n').slice(-40).join('\n');
    console.error(tail);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=${command} falhou::${tail.replaceAll('%', '%25').replaceAll('\r', '').replaceAll('\n', '%0A')}`);
    // a mensagem leva a saída inteira (até 150 linhas): vai pro relatório de falhas do grupo (check run)
    throw new Error(`${command} falhou\n${output.trim().split('\n').slice(-150).join('\n')}`);
  }
}

// bibliotecas que o jogo usa (gson, datafixerupper, log4j…): só as que valem pra linux e não são nativas
function wantedLibrary(library: Library): boolean {
  if (!library.downloads?.artifact) return false;
  if (library.name.includes(':natives-')) return false;
  if (!library.rules) return true;
  let allowed = false;
  for (const rule of library.rules) {
    if (!rule.os || rule.os.name === 'linux') allowed = rule.action === 'allow';
  }
  return allowed;
}

// baixa (ou reaproveita do cache) as bibliotecas e devolve o classpath
async function libraries(list: Library[]): Promise<string[]> {
  const paths: string[] = [];
  for (const library of list.filter(wantedLibrary)) {
    const { path, url, sha1 } = library.downloads!.artifact!;
    const file = join(CACHE_DIR, 'libraries', path);
    if (!existsSync(file)) await writeFileDeep(file, await fetchBuffer(url, sha1));
    paths.push(file);
  }
  return paths;
}

interface DumpedTab {
  id: string;
  type: string;
  items: { id: string }[];
}

// versões sem as definições de item (antes da 24w45a) desenhavam baús, camas, estandartes, shulkers, cabeças,
// escudo… direto pelo código (BlockEntityWithoutLevelRenderer), sem a definição "special". pra esses itens, o dump
// usa uma versão de referência: a 24w45a, a primeira com as definições, que tem a mesma geometria. dela vêm a
// definição de cada item (legacy-items/<id>.json, lida pelo IconResolver) e a malha (rodando o SpecialModelsDump
// compilado contra o jar dela); as texturas continuam sendo as da própria versão
const REFERENCE_ID = '24w45a';
let reference: Promise<{ classes: string; classpath: string[]; items: Record<string, string> }> | null = null;

function referenceDumper(all: Version[]) {
  reference ??= (async () => {
    const version = all.find((entry) => entry.id === REFERENCE_ID);
    if (!version) throw new Error(`versão de referência não encontrada: ${REFERENCE_ID}`);
    const pkg = await versionPackage(version);
    const libraryPaths = await libraries(pkg.libraries);
    const classpath = [await readableJar(version, pkg, libraryPaths), ...libraryPaths];
    const classes = join(CACHE_DIR, 'dumper', REFERENCE_ID);
    await rm(classes, { recursive: true, force: true });
    await mkdir(classes, { recursive: true });
    run('javac', ['-nowarn', '-cp', classpath.join(delimiter), '-d', classes, ...DUMPERS]);
    // definições de item que usam um modelo especial, e as dos ovos de geração (o texto do json, pra copiar como está)
    const items: Record<string, string> = {};
    const entries = unzipSync(await clientJar(version, pkg), { filter: (file) => file.name.startsWith('assets/minecraft/items/') && file.name.endsWith('.json') });
    for (const [name, data] of Object.entries(entries)) {
      const text = new TextDecoder().decode(data);
      // ovos de geração também: na referência as duas cores já vêm como tints constantes da definição
      if (text.includes('"minecraft:special"') || name.endsWith('_spawn_egg.json')) items[name.slice('assets/minecraft/items/'.length, -'.json'.length)] = text;
    }
    return { classes, classpath, items };
  })();
  return reference;
}

// arquivos que o dump deixa em .cache/versions/<id>/ (e que o CI guarda em je/_dumps/<hash do dump>/<id>.tar.gz)
export const DUMP_FILES = ['creative_tabs.json', 'specials.json', 'player.json', 'legacy-items'];

async function dump(version: Version, all: Version[]) {
  // dump reaproveitado pelo CI (o código que abre o jogo não mudou desde que ele foi feito): só lê
  const versionDir = join(CACHE_DIR, 'versions', version.id);
  if (existsSync(join(versionDir, 'dump-cached'))) {
    const read = async <T,>(file: string) => JSON.parse(await readFile(join(versionDir, file), 'utf8')) as T;
    const tabs = await read<{ version: string; tabs: DumpedTab[] }>('creative_tabs.json');
    return { ...tabs, meshes: await read<Record<string, { error?: string; parts?: { texture?: string; renderType: string; tint: number; quads: unknown[] }[] }>>('specials.json'), player: await read<Record<string, PlayerPart | unknown[]>>('player.json'), cached: true };
  }
  const pkg = await versionPackage(version);
  const libraryPaths = await libraries(pkg.libraries);
  // até a 1.21.11 o jar vem embaralhado: traduz com os mappings oficiais da Mojang antes (lib/remap.ts)
  const classpath = [await readableJar(version, pkg, libraryPaths), ...libraryPaths];

  // compila o dumper contra a versão (a api do jogo pode mudar de uma versão pra outra)
  const classes = join(CACHE_DIR, 'dumper', version.id);
  await rm(classes, { recursive: true, force: true });
  await mkdir(classes, { recursive: true });
  run('javac', ['-nowarn', '-cp', classpath.join(delimiter), '-d', classes, ...DUMPERS]);

  const out = join(CACHE_DIR, 'versions', version.id, 'creative_tabs.json');
  await mkdir(join(CACHE_DIR, 'versions', version.id), { recursive: true });
  // o jogo escreve bastante log ao iniciar: só aparece se der erro.
  // roda dentro da pasta das classes porque o jogo pode criar arquivos onde é executado
  run('java', ['-Djava.awt.headless=true', '-cp', [classes, ...classpath].join(delimiter), 'CreativeTabsDump', out], classes);

  const result = JSON.parse(await readFile(out, 'utf8')) as { version: string; tabs: DumpedTab[]; searchOnly?: { id: string }[] };

  // versão antiga (sem assets/minecraft/items): definições e malhas dos itens especiais vêm da referência
  let specialsClasses = classes;
  let specialsClasspath = classpath;
  if (!existsSync(join(versionDir, 'assets/minecraft/items'))) {
    const ref = await referenceDumper(all);
    await rm(join(versionDir, 'legacy-items'), { recursive: true, force: true });
    const ids = new Set([...result.tabs.flatMap((tab) => tab.items.map((item) => item.id)), ...(result.searchOnly ?? []).map((item) => item.id)].map((id) => id.replace(/^minecraft:/, '')));
    for (const id of ids) if (ref.items[id]) await writeFileDeep(join(versionDir, 'legacy-items', `${id}.json`), ref.items[id]!);
    specialsClasses = ref.classes;
    specialsClasspath = ref.classpath;
  }

  // modelos especiais (baú, estandarte, cabeça…): junta as definições únicas dos itens das abas e pede
  // pro jogo a geometria de cada uma
  const resolver = new IconResolver(join(CACHE_DIR, 'versions', version.id));
  const specials: Record<string, unknown> = {};
  const collect = (model: IconModel) => {
    if (model.kind === 'special') specials[model.key] = (model as SpecialModel).spec;
    if (model.kind === 'composite') model.parts.forEach(collect);
  };
  for (const id of new Set(result.tabs.flatMap((tab) => tab.items.map((item) => item.id)))) collect(resolver.resolve(id).model);
  const specialsIn = join(CACHE_DIR, 'versions', version.id, 'specials-input.json');
  const specialsOut = join(CACHE_DIR, 'versions', version.id, 'specials.json');
  await writeFile(specialsIn, JSON.stringify(specials));
  run('java', ['-Djava.awt.headless=true', '-cp', [specialsClasses, ...specialsClasspath].join(delimiter), 'SpecialModelsDump', specialsIn, specialsOut], specialsClasses);
  const meshes = JSON.parse(await readFile(specialsOut, 'utf8')) as Record<string, { error?: string; parts?: { texture?: string; renderType: string; tint: number; quads: unknown[] }[] }>;

  // modelo do jogador (aba "Inventário"): peças separadas, na pose de descanso
  const playerOut = join(CACHE_DIR, 'versions', version.id, 'player.json');
  run('java', ['-Djava.awt.headless=true', '-cp', [classes, ...classpath].join(delimiter), 'PlayerModelDump', playerOut], classes);
  const player = JSON.parse(await readFile(playerOut, 'utf8')) as Record<string, PlayerPart | unknown[]>;

  return { ...result, meshes, player, cached: false };
}

interface PlayerPart {
  pose: number[];
  quads: unknown[];
  children: Record<string, PlayerPart>;
}

// "head(6) > hat(6)" — resumo da árvore de peças pro relatório
function describePart(name: string, part: PlayerPart): string {
  const children = Object.entries(part.children).map(([childName, child]) => describePart(childName, child));
  return `${name}(${part.quads.length})${children.length ? ` > [${children.join(', ')}]` : ''}`;
}

const list = await official.listVersions();
const all = list.versions.map(withKind);
const wanted = selectIds(list, args.versions);

const report: string[] = [];
for (const id of wanted) {
  const version = all.find((v) => v.id === id);
  if (!version) throw new Error(`versão não encontrada no manifesto: ${id}`);
  // a extração dessa versão falhou antes (--keep-going): não tem o que montar
  if (!existsSync(join(CACHE_DIR, 'versions', id, 'meta.json'))) continue;
  let result: Awaited<ReturnType<typeof dump>>;
  try {
    result = await dump(version, all);
  } catch (error) {
    // sem dump completo, o build-data não pode usar essa versão
    await rm(join(CACHE_DIR, 'versions', id, 'creative_tabs.json'), { force: true });
    if (!args['keep-going']) throw error;
    reportFailure(id, error);
    continue;
  }
  console.log(`\n✓ ${id}: ${result.tabs.length} abas`);
  console.table(Object.fromEntries(result.tabs.map((tab) => [tab.id, { tipo: tab.type, itens: tab.items.length }])));

  // relatório em texto (vai pra check run, que o claude consegue ler)
  report.push(`# ${id} (jogo diz: ${result.version})${result.cached ? ' · dump reaproveitado' : ''}`);
  for (const tab of result.tabs) {
    report.push(`\n## ${tab.id} · ${tab.type} · ${tab.items.length} itens`);
    report.push(tab.items.slice(0, 12).map((item) => item.id.replace('minecraft:', '')).join(', ') + (tab.items.length > 12 ? ', …' : ''));
  }
  report.push('\n## modelos especiais');
  for (const [key, mesh] of Object.entries(result.meshes)) {
    if (mesh.error) {
      report.push(`- ✗ ${key}: ${mesh.error}`);
      continue;
    }
    const parts = mesh.parts ?? [];
    const quads = parts.reduce((total, part) => total + part.quads.length, 0);
    const first = parts[0];
    report.push(`- ✓ ${key}: ${parts.length} partes, ${quads} quadrados · ${first ? `${first.texture ?? first.renderType.slice(0, 160)} · tint ${first.tint}` : 'vazio'}`);
  }
  report.push('\n## modelo do jogador');
  for (const [model, root] of Object.entries(result.player)) {
    // "cape" é só a lista de quadrados da capa (ver PlayerModelDump), não uma peça
    report.push(Array.isArray(root) ? `- ${model}: ${root.length} quadrados` : `- ${model}: ${describePart('root', root)}`);
  }
  if (!('cape' in result.player)) report.push('- ✗ capa não encontrada');
  report.push(`- head pose: ${JSON.stringify((result.player.wide as PlayerPart | undefined)?.children.head?.pose)} · primeiro quadrado: ${JSON.stringify((result.player.wide as PlayerPart | undefined)?.children.head?.quads[0])}`);
  report.push('');
}
await writeFile(join(CACHE_DIR, 'dump-report.md'), report.join('\n'));
