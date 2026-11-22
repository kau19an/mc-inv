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
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type Strings = (typeof STRINGS)['pt_br'];
export const stringsFor = (locale: Locale): Strings => STRINGS[locale];

// atributo lang do html
export const HTML_LANG: Record<Locale, string> = { pt_br: 'pt-BR', en_us: 'en-US' };
