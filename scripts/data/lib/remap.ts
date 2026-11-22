// tradução do jar embaralhado (até a 1.21.11) de volta pros nomes reais, pra os dumpers compilarem e rodarem.
// a Mojang publica os mappings oficiais (formato do ProGuard, do nome real pro embaralhado) no pacote de cada
// versão; o AutoRenamingTool (ART) da NeoForged reescreve o jar usando esse arquivo ao contrário (--reverse).
// da 26.1 em diante o jar já vem com os nomes reais e passa direto.
//
// uso direto (sondagem do CI): node scripts/data/lib/remap.ts <id> → imprime o caminho do jar pra usar
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { CACHE_DIR, writeFileDeep } from './files.ts';
import { fetchBuffer } from './http.ts';
import { withKind, type Version } from './versions.ts';
import { clientJar, jarPath, official, versionPackage, type VersionPackage } from '../sources/official.ts';

const ART_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/AutoRenamingTool';
const PROBE_CLASS = 'net/minecraft/client/Minecraft.class'; // existe com esse nome só no jar não embaralhado

// o jar já tem os nomes reais? (lista as entradas sem descompactar nada)
function isReadable(jar: Uint8Array): boolean {
  let found = false;
  unzipSync(jar, { filter: (file) => (file.name === PROBE_CLASS && (found = true), false) });
  return found;
}

// baixa (uma vez) a versão mais recente do ART, o pacote "all" (com as dependências embutidas)
async function artJar(): Promise<string> {
  const metadata = new TextDecoder().decode(await fetchBuffer(`${ART_MAVEN}/maven-metadata.xml`));
  const version = /<release>([^<]+)<\/release>/.exec(metadata)?.[1];
  if (!version) throw new Error('não achei a versão do AutoRenamingTool no maven da NeoForged');
  const file = join(CACHE_DIR, 'tools', `AutoRenamingTool-${version}-all.jar`);
  if (!existsSync(file)) await writeFileDeep(file, await fetchBuffer(`${ART_MAVEN}/${version}/AutoRenamingTool-${version}-all.jar`));
  return file;
}

// caminho do jar pra compilar e rodar os dumpers: o original (26.1+) ou o traduzido (<id>-mapped.jar, em cache)
export async function readableJar(version: Version, pkg: VersionPackage, libraries: string[] = []): Promise<string> {
  const jar = await clientJar(version, pkg);
  if (isReadable(jar)) return jarPath(version.id);
  const mapped = join(CACHE_DIR, 'jars', `${version.id}-mapped.jar`);
  if (existsSync(mapped)) return mapped;
  const mappings = pkg.downloads.client_mappings;
  if (!mappings) throw new Error(`${version.id}: jar embaralhado e sem mappings oficiais (versões de antes da 1.14.4)`);
  const mappingsFile = join(CACHE_DIR, 'mappings', `${version.id}.txt`);
  if (!existsSync(mappingsFile)) await writeFileDeep(mappingsFile, await fetchBuffer(mappings.url, mappings.sha1));
  execFileSync(
    'java',
    [
      '-jar', await artJar(),
      '--input', jarPath(version.id),
      '--output', mapped,
      '--map', mappingsFile,
      '--reverse', // o arquivo da Mojang vai do nome real pro embaralhado
      '--strip-sigs', // a assinatura do jar não vale mais depois de renomear
      '--ann-fix', '--ids-fix', '--record-fix', // consertos que o ProGuard deixa (anotações, nomes de variável, records)
      ...libraries.flatMap((library) => ['--lib', library]), // heranças com as bibliotecas do jogo
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
  );
  return mapped;
}

if (import.meta.main) {
  const id = process.argv[2];
  if (!id) throw new Error('uso: node scripts/data/lib/remap.ts <id da versão>');
  const version = (await official.listVersions()).versions.map(withKind).find((entry) => entry.id === id);
  if (!version) throw new Error(`versão não encontrada: ${id}`);
  console.log(await readableJar(version, await versionPackage(version)));
}
