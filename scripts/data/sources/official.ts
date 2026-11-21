// fonte oficial: manifesto, jar do cliente e índice de assets da mojang (é o que roda no github actions)
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { unzipSync } from 'fflate';
import { fetchBuffer, fetchJson, sha1 } from '../lib/http.ts';
import { CACHE_DIR, isKept, isProgrammerArt, writeFileDeep } from '../lib/files.ts';
import type { Version, VersionEntry, VersionList } from '../lib/versions.ts';
import { wantsLocale, type Source } from './types.ts';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES_URL = 'https://resources.download.minecraft.net';

interface Manifest {
  latest: { release: string; snapshot: string };
  versions: { id: string; type: VersionEntry['type']; url: string; releaseTime: string; sha1: string }[];
}

interface VersionPackage {
  downloads: { client: { url: string; sha1: string } };
  assetIndex: { url: string; sha1: string };
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
}

// o jar fica guardado no cache: rodar de novo não baixa ~30 MB outra vez
async function clientJar(version: Version, pkg: VersionPackage): Promise<Uint8Array> {
  const path = join(CACHE_DIR, 'jars', `${version.id}.jar`);
  try {
    const cached = new Uint8Array(await readFile(path));
    if (sha1(cached) === pkg.downloads.client.sha1) return cached;
  } catch {
    // ainda não baixado
  }
  const jar = await fetchBuffer(pkg.downloads.client.url, pkg.downloads.client.sha1);
  await writeFileDeep(path, jar);
  return jar;
}

export const official: Source = {
  name: 'official',

  async listVersions(): Promise<VersionList> {
    const manifest = await fetchJson<Manifest>(MANIFEST_URL);
    return {
      latest: manifest.latest,
      versions: manifest.versions.map(({ id, type, url, releaseTime, sha1 }) => ({ id, type, url, releaseTime, sha1 })),
    };
  },

  async extract(version, outDir, locales) {
    if (!version.url) throw new Error(`versão sem url no manifesto: ${version.id}`);
    const pkg = await fetchJson<VersionPackage>(version.url, version.sha1);

    // 1. jar: só o que está em KEEP_PREFIXES (o en_us vem daqui) + o zip do programmer art
    let programmerArt: Uint8Array | null = null;
    const entries = unzipSync(await clientJar(version, pkg), {
      filter: (file) => isKept(file.name) || isProgrammerArt(file.name),
    });
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('/')) continue; // pasta
      if (isProgrammerArt(name)) programmerArt = data;
      else await writeFileDeep(join(outDir, name), data);
    }

    // 2. o que não vem no jar fica no índice de assets (endereçado pelo sha-1): os outros idiomas,
    // o programmer art (minecraft/resourcepacks/programmer_art.zip) e eventuais arquivos de KEEP_PREFIXES
    const index = await fetchJson<AssetIndex>(pkg.assetIndex.url, pkg.assetIndex.sha1);
    const download = (hash: string) => fetchBuffer(`${RESOURCES_URL}/${hash.slice(0, 2)}/${hash}`, hash);

    for (const [key, { hash }] of Object.entries(index.objects)) {
      // "minecraft/lang/pt_br.json" (atual) ou "lang/pt_BR.lang" (versões antigas)
      if (/(^|\/)lang\/[^/]+\.(json|lang)$/.test(key)) {
        if (wantsLocale(locales, basename(key))) await writeFileDeep(join(outDir, 'assets/minecraft/lang', basename(key)), await download(hash));
      } else if (isProgrammerArt(key)) {
        programmerArt ??= await download(hash);
      } else if (isKept(`assets/${key}`)) {
        await writeFileDeep(join(outDir, 'assets', key), await download(hash));
      }
    }

    return { programmerArt };
  },
};
