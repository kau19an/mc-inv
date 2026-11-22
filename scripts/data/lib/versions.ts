// versões do jogo: tipos do manifesto da mojang e a classificação que a gente mostra no site
import overrides from '../version-overrides.json' with { type: 'json' };

// o manifesto só conhece esses quatro tipos (pre-release e release candidate vêm como "snapshot")
export type ManifestType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha';

// classificação própria, usada nos rótulos da lista de versões
export type VersionKind = 'release' | 'snapshot' | 'pre_release' | 'release_candidate' | 'april_fools' | 'old_beta' | 'old_alpha';

export interface VersionEntry {
  id: string;
  type: ManifestType;
  releaseTime: string; // iso 8601, como vem no manifesto
  url?: string; // json da versão (só na fonte oficial)
  sha1?: string; // hash desse json
}

export interface Version extends VersionEntry {
  kind: VersionKind;
}

export interface VersionList {
  latest: { release: string; snapshot: string };
  versions: VersionEntry[];
}

// "26.3-pre-3", "1.21.11-pre5", "1.14 Pre-Release 1"
const PRE_RELEASE = /(-pre-?\d+| pre-release \d+)$/i;
// "26.3-rc-1", "1.21.11-rc3"
const RELEASE_CANDIDATE = /-rc-?\d+$/i;

const kindOverrides = overrides as Record<string, VersionKind>;

export function classify(entry: VersionEntry): VersionKind {
  // correções manuais vencem tudo (ex.: "1.RV-Pre1" é piada de 1º de abril, mas tem cara de pre-release)
  const override = kindOverrides[entry.id];
  if (override) return override;

  if (entry.type !== 'snapshot') return entry.type;
  if (RELEASE_CANDIDATE.test(entry.id)) return 'release_candidate';
  if (PRE_RELEASE.test(entry.id)) return 'pre_release';
  // a mojang não solta snapshot de verdade em 1º de abril (utc): se saiu nesse dia, é a versão de piada
  if (entry.releaseTime.slice(5, 10) === '04-01') return 'april_fools';
  return 'snapshot';
}

export function withKind(entry: VersionEntry): Version {
  return { ...entry, kind: classify(entry) };
}

// os dois "trilhos" acompanhados agora: última release e último snapshot (sem repetir quando são a mesma)
export function trackedIds(list: VersionList): string[] {
  return [...new Set([list.latest.release, list.latest.snapshot])];
}

// versões do histórico publicado: as dos drops com número de ano (26.1 em diante), que vêm do jogo sem o código
// embaralhado. as anteriores (1.21.x pra trás) precisam dos mapas da Mojang e de um dumper adaptado: etapa futura
const HISTORY = /^(\d{2})\.\d+/;
export const inHistory = (id: string) => Number(HISTORY.exec(id)?.[1] ?? 0) >= 26;

// quais versões uma etapa processa: "tracked" (última release + último snapshot), "history" (todo o histórico
// publicado), "none" (nenhuma: só atualiza a lista de versões) ou ids separados por vírgula
export function selectIds(list: VersionList, spec: string): string[] {
  if (spec === 'none') return [];
  if (spec === 'tracked') return trackedIds(list);
  if (spec === 'history') return list.versions.filter((version) => inHistory(version.id)).map((version) => version.id);
  return spec.split(',').map((id) => id.trim()).filter(Boolean);
}

// erro de uma versão sem parar as outras (--keep-going): vira anotação no github actions e a etapa segue
export function reportFailure(id: string, error: unknown): void {
  const message = (error instanceof Error ? error.message : String(error)).split('\n').slice(0, 20).join('%0A');
  console.error(`✗ ${id}: ${error instanceof Error ? error.message : String(error)}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${id} falhou::${message}`);
}
