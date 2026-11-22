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
    wikiHint: 'Clique pra avançar; Shift + clique (ou botão direito) pra voltar',
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
    wikiHint: 'Click to go forward; Shift + click (or right-click) to go back',
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type Strings = (typeof STRINGS)['pt_br'];
export const stringsFor = (locale: Locale): Strings => STRINGS[locale];

// atributo lang do html
export const HTML_LANG: Record<Locale, string> = { pt_br: 'pt-BR', en_us: 'en-US' };
