// textos da interface que não vêm do jogo (rótulos de acessibilidade, opções, mensagens), nos idiomas publicados.
// o que o jogo já traduz (abas, itens, tooltips) vem dos arquivos de idioma da versão
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
    options: 'Opções...',
    optionsTitle: 'Opções',
    done: 'Concluído',
    on: 'LIGADO',
    off: 'DESLIGADO',
    language: 'Idioma',
    programmerArt: 'Programmer Art',
    advancedTooltips: 'Tooltips F3+H',
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
    options: 'Options...',
    optionsTitle: 'Options',
    done: 'Done',
    on: 'ON',
    off: 'OFF',
    language: 'Language',
    programmerArt: 'Programmer Art',
    advancedTooltips: 'F3+H tooltips',
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type Strings = (typeof STRINGS)['pt_br'];
export const stringsFor = (locale: Locale): Strings => STRINGS[locale];

// nome de cada idioma nele mesmo (como na tela de idiomas do jogo)
export const LANGUAGE_NAMES: Record<Locale, string> = { pt_br: 'Português (Brasil)', en_us: 'English (US)' };

// atributo lang do html
export const HTML_LANG: Record<Locale, string> = { pt_br: 'pt-BR', en_us: 'en-US' };
