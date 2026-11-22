// nomes dos "drops" (as atualizações do jogo desde 2026), pra agrupar as versões na tela "Versões...".
// o número do drop são os dois primeiros números da versão: "26.4-snapshot-10" e "26.4" são do drop 26.4,
// "26.3-rc-1" e "26.3.1" do 26.3. o nome não vem nos arquivos do jogo; sai nos anúncios da Mojang (minecraft.net).
// nomes oficiais, iguais em todos os idiomas (a Mojang não traduz). drop sem nome aqui aparece só pelo número
export const DROP_NAMES: Record<string, string> = {
  '26.1': 'Tiny Takeover',
  '26.2': 'Chaos Cubed',
  '26.3': 'Wilderness Bound',
  '26.4': 'Deep Freeze',
};

// número do drop de uma versão ("26.4-snapshot-10" → "26.4"); versões fora desse formato ficam sozinhas
export function dropOf(versionId: string): string {
  return /^(\d+\.\d+)/.exec(versionId)?.[1] ?? versionId;
}

export const dropName = (drop: string) => DROP_NAMES[drop] ?? drop;

// drop ainda em desenvolvimento (sem nenhuma release): ganha "Em breve". usa a lista completa da Mojang
// (releasedDrops, do versions.json); versão publicada antes dela: olha só as versões publicadas
export function isUpcoming(drop: string, versions: { id: string; kind: string }[], releasedDrops?: string[]): boolean {
  if (releasedDrops) return !releasedDrops.includes(drop);
  return !versions.some((version) => version.kind === 'release' && dropOf(version.id) === drop);
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
