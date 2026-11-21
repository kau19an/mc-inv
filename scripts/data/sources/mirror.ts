// fonte espelho (só para desenvolvimento): repositórios da comunidade no github com os arquivos de cada versão.
// - lista de versões: misode/mcmeta (resumo de cada versão desde a 1.14; não lista as de 1º de abril)
// - arquivos: InventivetalentDev/minecraft-assets (uma branch por versão, com assets, data, todos os idiomas e o programmer art)
import { execFileSync } from 'node:child_process';
import { cp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fetchJson } from '../lib/http.ts';
import { CACHE_DIR, KEEP_PREFIXES } from '../lib/files.ts';
import type { VersionEntry, VersionList } from '../lib/versions.ts';
import type { Source } from './types.ts';

const VERSIONS_URL = 'https://raw.githubusercontent.com/misode/mcmeta/summary/versions/data.json';
const ASSETS_REPO = 'https://github.com/InventivetalentDev/minecraft-assets';

interface McmetaVersion {
  id: string;
  type: 'release' | 'snapshot';
  release_time: string;
}

const git = (args: string[], cwd?: string) => execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });

export const mirror: Source = {
  name: 'mirror',

  async listVersions(): Promise<VersionList> {
    const list = await fetchJson<McmetaVersion[]>(VERSIONS_URL);
    const versions: VersionEntry[] = list.map(({ id, type, release_time }) => ({ id, type, releaseTime: release_time }));
    const latestRelease = versions.find((v) => v.type === 'release');
    if (!latestRelease || !versions[0]) throw new Error('lista de versões do espelho veio vazia');
    return { latest: { release: latestRelease.id, snapshot: versions[0].id }, versions };
  },

  async extract(version, outDir, locales) {
    // clone raso e "esparso": baixa só as pastas que interessam, não o repositório inteiro
    const repoDir = join(CACHE_DIR, 'mirror', version.id);
    await rm(repoDir, { recursive: true, force: true });
    git(['clone', '--quiet', '--depth', '1', '--branch', version.id, '--filter=blob:none', '--sparse', ASSETS_REPO, repoDir]);

    const langPatterns =
      locales === 'all' ? [] : locales.flatMap((locale) => [`/assets/minecraft/lang/${locale}.json`, `/assets/minecraft/lang/${locale}.lang`]);
    const patterns = [
      ...KEEP_PREFIXES.filter((prefix) => locales === 'all' || !prefix.endsWith('/lang/')).map((prefix) => `/${prefix}`),
      ...langPatterns,
      '/assets/minecraft/resourcepacks/programmer_art.zip',
    ];
    git(['sparse-checkout', 'set', '--no-cone', ...patterns], repoDir);

    for (const top of ['assets', 'data']) {
      if (existsSync(join(repoDir, top))) await cp(join(repoDir, top), join(outDir, top), { recursive: true });
    }

    const zipPath = join(outDir, 'assets/minecraft/resourcepacks/programmer_art.zip');
    const programmerArt = existsSync(zipPath) ? new Uint8Array(await readFile(zipPath)) : null;
    await rm(join(outDir, 'assets/minecraft/resourcepacks'), { recursive: true, force: true });
    await rm(repoDir, { recursive: true, force: true });
    return { programmerArt };
  },
};
