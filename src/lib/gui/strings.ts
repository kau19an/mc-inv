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
    skinLoading: 'Buscando skin…',
    skinFound: (name: string) => `Skin de ${name} aplicada.`,
    skinDefault: (name: string) => `${name} não tem skin própria: usando o Steve.`,
    skinReset: 'Usando o Steve.',
    skinInvalid: 'Nome inválido: use letras, números e _ (até 16).',
    skinNotFound: 'Jogador não encontrado.',
    skinUpstream: 'Não deu pra buscar a skin agora. Tente de novo daqui a pouco.',
    skinUnavailable: 'A busca de skin só funciona no site publicado.',
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
    skinLoading: 'Fetching skin…',
    skinFound: (name: string) => `${name}'s skin applied.`,
    skinDefault: (name: string) => `${name} has no custom skin: using Steve.`,
    skinReset: 'Using Steve.',
    skinInvalid: 'Invalid name: use letters, numbers and _ (up to 16).',
    skinNotFound: 'Player not found.',
    skinUpstream: "Couldn't fetch the skin right now. Try again in a bit.",
    skinUnavailable: 'Skin lookup only works on the published site.',
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type Strings = (typeof STRINGS)['pt_br'];
export const stringsFor = (locale: Locale): Strings => STRINGS[locale];

// atributo lang do html
export const HTML_LANG: Record<Locale, string> = { pt_br: 'pt-BR', en_us: 'en-US' };
