// npm run dump — monta as abas do inventário criativo usando o próprio jogo (precisa de java 25+)
// e grava em .cache/versions/<id>/creative_tabs.json. só funciona com a fonte oficial (precisa do jar).
//
// opções:
//   --versions=tracked|<ids>   igual ao npm run data
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchBuffer } from './lib/http.ts';
import { CACHE_DIR, writeFileDeep } from './lib/files.ts';
import { trackedIds, withKind, type Version } from './lib/versions.ts';
import { clientJar, official, versionPackage, type Library } from './sources/official.ts';

const { values: args } = parseArgs({ options: { versions: { type: 'string', default: 'tracked' } } });

const DUMPER = join(import.meta.dirname, 'dumper/CreativeTabsDump.java');

// roda um comando; se falhar, publica o fim da saída de erro como anotação do github actions
// (é o único jeito do claude ler o erro, já que ele não acessa os logs)
function run(command: string, commandArgs: string[], cwd?: string) {
  try {
    execFileSync(command, commandArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const output = String((error as { stderr?: Buffer }).stderr ?? '') + String((error as { stdout?: Buffer }).stdout ?? '');
    const tail = output.trim().split('\n').slice(-40).join('\n');
    console.error(tail);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=${command} falhou::${tail.replaceAll('%', '%25').replaceAll('\r', '').replaceAll('\n', '%0A')}`);
    throw new Error(`${command} falhou`);
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

async function dump(version: Version) {
  const pkg = await versionPackage(version);
  await clientJar(version, pkg); // garante o jar no cache
  const classpath = [join(CACHE_DIR, 'jars', `${version.id}.jar`), ...(await libraries(pkg.libraries))];

  // compila o dumper contra a versão (a api do jogo pode mudar de uma versão pra outra)
  const classes = join(CACHE_DIR, 'dumper', version.id);
  await rm(classes, { recursive: true, force: true });
  await mkdir(classes, { recursive: true });
  run('javac', ['-nowarn', '-cp', classpath.join(delimiter), '-d', classes, DUMPER]);

  const out = join(CACHE_DIR, 'versions', version.id, 'creative_tabs.json');
  await mkdir(join(CACHE_DIR, 'versions', version.id), { recursive: true });
  // o jogo escreve bastante log ao iniciar: só aparece se der erro.
  // roda dentro da pasta das classes porque o jogo pode criar arquivos onde é executado
  run('java', ['-Djava.awt.headless=true', '-cp', [classes, ...classpath].join(delimiter), 'CreativeTabsDump', out], classes);

  return JSON.parse(await readFile(out, 'utf8')) as { version: string; tabs: DumpedTab[] };
}

const list = await official.listVersions();
const all = list.versions.map(withKind);
const wanted = args.versions === 'tracked' ? trackedIds(list) : args.versions.split(',').map((id) => id.trim());

const report: string[] = [];
for (const id of wanted) {
  const version = all.find((v) => v.id === id);
  if (!version) throw new Error(`versão não encontrada no manifesto: ${id}`);
  const result = await dump(version);
  console.log(`\n✓ ${id}: ${result.tabs.length} abas`);
  console.table(Object.fromEntries(result.tabs.map((tab) => [tab.id, { tipo: tab.type, itens: tab.items.length }])));

  // relatório em texto (vai pra check run, que o claude consegue ler)
  report.push(`# ${id} (jogo diz: ${result.version})`);
  for (const tab of result.tabs) {
    report.push(`\n## ${tab.id} · ${tab.type} · ${tab.items.length} itens`);
    report.push(tab.items.slice(0, 12).map((item) => item.id.replace('minecraft:', '')).join(', ') + (tab.items.length > 12 ? ', …' : ''));
  }
  report.push('');
}
await writeFile(join(CACHE_DIR, 'dump-report.md'), report.join('\n'));
