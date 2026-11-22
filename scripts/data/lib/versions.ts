// versões do jogo: tipos do manifesto da mojang e a classificação que a gente mostra no site
import overrides from '../version-overrides.json' with { type: 'json' };
import { DROP_NAMES, assignDrops } from '../../../src/lib/gui/drops.ts';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR } from './files.ts';

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

// versões do histórico publicado: as dos drops com nome (1.21.2 em diante; ver DROP_NAMES). as da 1.21.x vêm com o
// código embaralhado e passam pela tradução com os mapas da Mojang no dump (mc-inv/versoes-1-21.md)
export function historyIds(versions: { id: string; releaseTime: string }[]): string[] {
  const drops = assignDrops(versions);
  return versions.filter((version) => drops.get(version.id)! in DROP_NAMES).map((version) => version.id);
}

// quais versões uma etapa processa: "tracked" (última release + último snapshot), "history" (todo o histórico
// publicado), "none" (nenhuma: só atualiza a lista de versões) ou ids separados por vírgula
export function selectIds(list: VersionList, spec: string): string[] {
  if (spec === 'none') return [];
  if (spec === 'tracked') return trackedIds(list);
  if (spec === 'history') return historyIds(list.versions);
  return spec.split(',').map((id) => id.trim()).filter(Boolean);
}

// erro de uma versão sem parar as outras (--keep-going): vira anotação no github actions e a etapa segue
// e vai inteiro pra .cache/failures.md, que o CI publica como check run (as anotações do github têm limite por
// etapa, e com dezenas de versões falhando a maioria some)
export function reportFailure(id: string, error: unknown): void {
  const text = error instanceof Error ? error.message : String(error);
  console.error(`✗ ${id}: ${text}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${id} falhou::${text.split('\n').slice(0, 20).join('%0A')}`);
  appendFileSync(join(CACHE_DIR, 'failures.md'), `## ${id}\n\n\`\`\`\n${text.split('\n').slice(0, 150).join('\n')}\n\`\`\`\n\n`);
}
