// nomes dos "drops" (as atualizações menores do jogo, desde a 1.21.2), pra agrupar as versões na tela "Versões...".
// o nome não vem nos arquivos do jogo; sai nos anúncios da Mojang (conferidos na Minecraft Wiki, "Game Drop").
// nomes oficiais, iguais em todos os idiomas (a Mojang não traduz). drop sem nome aqui aparece só pelo número.
// os drops com nome são também os que o histórico publica. antes dos drops oficiais (1.21.2), os nomes e os
// agrupamentos seguem a navbox da wiki (Template:Navbox Java Edition versions): 1.21 (Tricky Trials), 1.20.5
// (Armored Paws, que a Mojang já chamou de "drop"), 1.20.3 (Bats and Pots), 1.20 (Trails & Tales, com 1.20.1 e 1.20.2)
export const DROP_NAMES: Record<string, string> = {
  '1.20': 'Trails & Tales',
  '1.20.3': 'Bats and Pots',
  '1.20.5': 'Armored Paws',
  '1.21': 'Tricky Trials',
  '1.21.2': 'Bundles of Bravery',
  '1.21.4': 'The Garden Awakens',
  '1.21.5': 'Spring to Life',
  '1.21.6': 'Chase the Skies',
  '1.21.9': 'The Copper Age',
  '1.21.11': 'Mounts of Mayhem',
  '26.1': 'Tiny Takeover',
  '26.2': 'Chaos Cubed',
  '26.3': 'Wilderness Bound',
  '26.4': 'Deep Freeze',
};

// versões de correção que pertencem a um drop anterior (1.21.3 corrigiu o Bundles of Bravery etc.)
const PATCH_OF: Record<string, string> = { '1.20.1': '1.20', '1.20.2': '1.20', '1.20.4': '1.20.3', '1.20.6': '1.20.5', '1.21.1': '1.21', '1.21.3': '1.21.2', '1.21.7': '1.21.6', '1.21.8': '1.21.6', '1.21.10': '1.21.9' };

// drop pelo número da versão, quando ele está no id:
// - 26.x em diante: os dois primeiros números ("26.4-snapshot-10" → "26.4", "26.3.1" → "26.3");
// - 1.x: os três primeiros ("1.21.4-pre1" → "1.21.4"), com as correções levadas pro drop delas;
// snapshots semanais ("24w33a") não têm número: null (o drop delas sai de assignDrops, com a lista inteira)
function numberedDrop(versionId: string): string | null {
  const legacy = /^1\.(\d+)(?:\.(\d+))?(?![\d.])/.exec(versionId);
  if (legacy) {
    const drop = legacy[2] ? `1.${legacy[1]}.${legacy[2]}` : `1.${legacy[1]}`;
    return PATCH_OF[drop] ?? drop;
  }
  return /^(\d{2}\.\d+)/.exec(versionId)?.[1] ?? null;
}

// número do drop pelo id; versões sem número (snapshots semanais) ficam sozinhas. sem a lista inteira, é o melhor
// que dá: o versions.json publicado já traz o drop calculado por assignDrops em cada versão
export function dropOf(versionId: string): string {
  return numberedDrop(versionId) ?? versionId;
}

// drop de cada versão, olhando a lista inteira da Mojang: uma snapshot semanal ("24w33a", "25w41a") pertence ao
// drop da próxima versão numerada que saiu depois dela (24w33a → 1.21.2). usado pelo pipeline
export function assignDrops(versions: { id: string; releaseTime: string }[]): Map<string, string> {
  const drops = new Map<string, string>();
  let pending: string[] = [];
  for (const { id } of [...versions].sort((a, b) => a.releaseTime.localeCompare(b.releaseTime))) {
    const drop = numberedDrop(id);
    if (!drop) {
      pending.push(id);
      continue;
    }
    drops.set(id, drop);
    for (const waiting of pending) drops.set(waiting, drop);
    pending = [];
  }
  for (const waiting of pending) drops.set(waiting, waiting); // semanais depois da última numerada: sozinhas
  return drops;
}

export const dropName = (drop: string) => DROP_NAMES[drop] ?? drop;

// drop ainda em desenvolvimento (sem nenhuma release): ganha "Em breve". usa a lista completa da Mojang
// (releasedDrops, do versions.json); versão publicada antes dela: olha só as versões publicadas
export function isUpcoming(drop: string, versions: { id: string; kind: string; drop?: string }[], releasedDrops?: string[]): boolean {
  if (releasedDrops) return !releasedDrops.includes(drop);
  return !versions.some((version) => version.kind === 'release' && (version.drop ?? dropOf(version.id)) === drop);
}

// nome do tipo de uma versão de desenvolvimento, do jeito que a Mojang escreve (em inglês, nos dois idiomas).
// a caixa já mudou com o tempo (ex.: "Pre-release" e "Pre-Release" em épocas diferentes): quando as versões antigas
// entrarem no site, esta é a função pra ajustar por época. hoje (26.x): "Snapshot", "Pre-Release", "Release Candidate"
export function developmentKindName(kind: string): string | null {
  switch (kind) {
    case 'snapshot':
      return 'Snapshot';
    case 'pre_release':
      return 'Pre-Release';
    case 'release_candidate':
      return 'Release Candidate';
    default:
      return null;
  }
}
