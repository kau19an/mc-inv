// uma "fonte" é de onde vêm os arquivos do jogo. em produção, a oficial (jar da mojang);
// no desenvolvimento, o espelho no github (o ambiente do claude não alcança os servidores da mojang)
import type { Version, VersionList } from '../lib/versions.ts';

export type Locales = 'all' | string[]; // ex.: ['en_us', 'pt_br']

export interface ExtractResult {
  programmerArt: Uint8Array | null; // o zip do pacote, se a versão tiver
}

export interface Source {
  name: 'official' | 'mirror';
  listVersions(): Promise<VersionList>;
  // grava em outDir os arquivos de KEEP_PREFIXES (+ idiomas), no layout assets/… e data/…
  extract(version: Version, outDir: string, locales: Locales): Promise<ExtractResult>;
}

export const wantsLocale = (locales: Locales, name: string) =>
  locales === 'all' || locales.includes(name.toLowerCase().replace(/\.(json|lang)$/, ''));
