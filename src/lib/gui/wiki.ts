// link pra página do item na Minecraft Wiki. o idioma da wiki é uma opção: "automático" (segue o idioma da
// interface) ou um fixo, que não muda com o idioma. usa a busca com "Ir" da wiki: se existe uma página com esse
// título (ou um redirecionamento), ela abre direto; se não existe, mostra os resultados da busca.
// as wikis titulam as páginas com os nomes do jogo no idioma delas ("Picareta de Madeira", "Pioche en bois"),
// então a busca vai com o nome do item no idioma da wiki (wiki/<locale>.json, publicado pelo build-data).
// "Special:Search" é o nome canônico da página de busca e funciona em todas as wikis, de qualquer idioma
import type { Locale } from './data.ts';

// as wikis de idiomas da minecraft.wiki (mapa de interwikis da própria wiki, siprop=interwikimap) e o arquivo de
// idioma do jogo com os nomes que cada uma usa. a wiki em português usa os nomes do português do Brasil
export const WIKI_LANGUAGES = [
  { code: 'cs', locale: 'cs_cz' },
  { code: 'de', locale: 'de_de' },
  { code: 'el', locale: 'el_gr' },
  { code: 'en', locale: 'en_us' },
  { code: 'es', locale: 'es_es' },
  { code: 'fr', locale: 'fr_fr' },
  { code: 'he', locale: 'he_il' },
  { code: 'hu', locale: 'hu_hu' },
  { code: 'id', locale: 'id_id' },
  { code: 'it', locale: 'it_it' },
  { code: 'ja', locale: 'ja_jp' },
  { code: 'ko', locale: 'ko_kr' },
  { code: 'lzh', locale: 'lzh' },
  { code: 'nl', locale: 'nl_nl' },
  { code: 'pl', locale: 'pl_pl' },
  { code: 'pt', locale: 'pt_br' },
  { code: 'ru', locale: 'ru_ru' },
  { code: 'th', locale: 'th_th' },
  { code: 'tr', locale: 'tr_tr' },
  { code: 'uk', locale: 'uk_ua' },
  { code: 'zh', locale: 'zh_cn' },
] as const;

export type WikiCode = (typeof WIKI_LANGUAGES)[number]['code'];
export type WikiLanguage = 'auto' | WikiCode;

// ordem do botão que alterna: automático primeiro, depois as wikis
export const WIKI_CHOICES: WikiLanguage[] = ['auto', ...WIKI_LANGUAGES.map((wiki) => wiki.code)];

export const isWikiLanguage = (value: unknown): value is WikiLanguage => WIKI_CHOICES.includes(value as WikiLanguage);

// idioma da interface → wiki (no automático)
const WIKI_OF_LOCALE: Record<Locale, WikiCode> = { pt_br: 'pt', en_us: 'en' };

export function resolveWiki(choice: WikiLanguage, locale: Locale): WikiCode {
  return choice === 'auto' ? WIKI_OF_LOCALE[locale] : choice;
}

// arquivo de idioma do jogo com os nomes que a wiki usa
export const wikiLocale = (code: WikiCode): string => WIKI_LANGUAGES.find((wiki) => wiki.code === code)!.locale;

export const wikiHost = (code: WikiCode) => (code === 'en' ? 'minecraft.wiki' : `${code}.minecraft.wiki`);

export function wikiUrl(name: string, code: WikiCode): string {
  const params = new URLSearchParams({ search: name, go: 'Go' });
  return `https://${wikiHost(code)}/w/Special:Search?${params}`;
}
