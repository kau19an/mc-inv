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
    wikiTooltip: 'Define o idioma da Minecraft Wiki ao redirecionar para o recurso clicado. Por padrão, "Automático" corresponde ao idioma definido na opção acima.',
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
    wikiAuto: 'Automatic',
    wikiLanguageNames: { lzh: 'Literary Chinese' } as Record<string, string>,
    languageTooltip: 'Sets the language of the game resources and the site interface.',
    confirmDisabledTooltip: 'Change the player name to confirm a new skin.',
    wikiTooltip: 'Sets the Minecraft Wiki language when redirecting to the clicked resource. By default, "Automatic" matches the language set in the option above.',
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type Strings = (typeof STRINGS)['pt_br'];
export const stringsFor = (locale: Locale): Strings => STRINGS[locale];

// atributo lang do html
export const HTML_LANG: Record<Locale, string> = { pt_br: 'pt-BR', en_us: 'en-US' };
