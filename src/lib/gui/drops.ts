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
