// link pra página do item na Minecraft Wiki, no idioma da interface.
// usa a busca com "Ir" da wiki: se existe uma página com esse título (ou um redirecionamento), ela abre direto;
// se não existe, mostra os resultados da busca — melhor do que cair numa página inexistente.
// os títulos da wiki em português seguem os nomes do jogo ("Picareta de Madeira")
const WIKIS: Record<string, { host: string; searchPage: string }> = {
  pt_br: { host: 'https://pt.minecraft.wiki', searchPage: 'Especial:Pesquisar' },
  en_us: { host: 'https://minecraft.wiki', searchPage: 'Special:Search' },
};

export function wikiUrl(name: string, locale = 'pt_br'): string {
  const wiki = WIKIS[locale] ?? WIKIS.en_us!;
  const params = new URLSearchParams({ search: name, go: 'Go' });
  return `${wiki.host}/w/${wiki.searchPage}?${params}`;
}
