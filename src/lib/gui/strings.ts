// textos da interface que não vêm do jogo (rótulos de acessibilidade, mensagens), nos idiomas publicados.
// o que o jogo já traduz (abas, itens, tooltips, opções — ver ui-keys.ts) vem dos arquivos de idioma da versão
import type { Locale } from './data.ts';

const STRINGS = {
  pt_br: {
    loading: 'Carregando…',
    loadError: 'Não deu pra carregar o inventário:',
    tabs: 'Abas do inventário',
    items: 'Itens',
    search: 'Pesquisar itens',
    scroll: 'Rolagem dos itens',
    found: (count: number) => `${count} ${count === 1 ? 'item encontrado' : 'itens encontrados'}`,
    opensWiki: 'abre a Minecraft Wiki em outra aba',
    skins: 'Skins',
    playerName: 'Nome de jogador',
    confirm: 'Confirmar',
    skinSuccess: 'Skin aplicada com sucesso.',
    skinNotFound: 'Jogador não encontrado.',
    wikiAuto: 'Automático',
    // nomes que o Intl.DisplayNames do navegador às vezes não conhece
    wikiLanguageNames: { lzh: 'Chinês clássico' } as Record<string, string>,
    // tooltips das opções (como as de algumas opções do jogo)
    languageTooltip: 'Define o idioma dos recursos do jogo e interface do site.',
    confirmDisabledTooltip: 'Altere o nome de jogador para confirmar uma nova skin.',
    playerNotFoundTooltip: 'Este nome de jogador não foi encontrado.',
    wikiTooltip: 'Define o idioma da Minecraft Wiki ao redirecionar para o recurso clicado. Por padrão, "Automático" corresponde ao idioma definido na opção acima.',
    // tela "Versões..." (o jogo não tem; textos do site)
    versionsButton: 'Versões...',
    versionsTitle: 'Opções de versões',
    versionsSearch: 'Buscar...',
    versionsLatest: 'Mais recente',
    versionsDevelopment: 'Desenvolvimento',
    versionsLatestTooltip: 'Define a versão de lançamento mais recente.',
    versionsDevelopmentTooltip: 'Define a versão de desenvolvimento mais recente, desde snapshots até release candidates.',
    versionsFilter: 'Tipos...',
    versionsFilterTitle: 'Tipos de versão',
    versionsList: 'Versões',
    versionsEmpty: 'Nenhuma versão encontrada.',
    latestReleaseTag: 'Mais recente',
    upcomingTag: 'Em breve', // drop ainda sem release
    // tipos que não são de desenvolvimento (esses vão com o nome da Mojang: drops.ts, developmentKindName)
    versionKinds: { release: 'Lançamento', april_fools: 'Primeiro de abril', old_beta: 'Beta', old_alpha: 'Alfa' } as Record<string, string>,
  },
  en_us: {
    loading: 'Loading…',
    loadError: "Couldn't load the inventory:",
    tabs: 'Inventory tabs',
    items: 'Items',
    search: 'Search items',
    scroll: 'Item scrolling',
    found: (count: number) => `${count} ${count === 1 ? 'item found' : 'items found'}`,
    opensWiki: 'opens the Minecraft Wiki in a new tab',
    skins: 'Skins',
    playerName: 'Player name',
    confirm: 'Confirm',
    skinSuccess: 'Skin successfully applied.',
    skinNotFound: 'Player not found.',
    wikiAuto: 'Auto',
    wikiLanguageNames: { lzh: 'Literary Chinese' } as Record<string, string>,
    languageTooltip: 'Sets the language of the game resources and the site interface.',
    confirmDisabledTooltip: 'Change the player name to confirm a new skin.',
    playerNotFoundTooltip: 'This player name was not found.',
    wikiTooltip: 'Sets the Minecraft Wiki language when redirecting to the clicked resource. By default, "Auto" matches the language set in the option above.',
    versionsButton: 'Versions...',
    versionsTitle: 'Version Options',
    versionsSearch: 'Search...',
    versionsLatest: 'Latest',
    versionsDevelopment: 'Development',
    versionsLatestTooltip: 'Sets the latest release version.',
    versionsDevelopmentTooltip: 'Sets the latest development version, from snapshots to release candidates.',
    versionsFilter: 'Types...',
    versionsFilterTitle: 'Version types',
    versionsList: 'Versions',
    versionsEmpty: 'No versions found.',
    latestReleaseTag: 'Latest',
    upcomingTag: 'Coming soon',
    versionKinds: { release: 'Release', april_fools: 'April Fools', old_beta: 'Beta', old_alpha: 'Alpha' } as Record<string, string>,
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type Strings = (typeof STRINGS)['pt_br'];
export const stringsFor = (locale: Locale): Strings => STRINGS[locale];

// atributo lang do html
export const HTML_LANG: Record<Locale, string> = { pt_br: 'pt-BR', en_us: 'en-US' };
