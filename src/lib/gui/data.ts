// carrega tudo que a tela do criativo precisa de uma versão (public/data/je/<versão>/) no navegador
import { createTextureLookup, type AtlasPixels, type IconBundle } from '../icons/bundle.ts';
import type { TextureLookup } from '../icons/types.ts';
import type { TabInfo, TextComponent } from './creative.ts';
import { loadFont, type BitmapFont } from './font.ts';
import type { PlayerModels, Skin } from './player.ts';
import type { GuiBundle } from './types.ts';

export interface ItemInfo {
  id: string;
  name: TextComponent;
  components?: Record<string, unknown>;
  tooltip?: unknown[]; // linhas da tooltip montadas pelo jogo (componentes de texto)
  advancedExtra?: unknown[]; // o que a tooltip avançada (F3+H) acrescenta no fim
  advanced?: unknown[]; // a avançada inteira, quando ela muda algo no meio
}

// idiomas publicados (a interface troca entre eles nas opções)
export const LOCALES = ['pt_br', 'en_us'] as const;
export type Locale = (typeof LOCALES)[number];

export interface VersionData {
  id: string;
  baseUrl: string; // /data/je/<versão>
  tabs: TabInfo[];
  items: Record<string, ItemInfo>;
  langs: Record<Locale, Record<string, string>>;
  locale: Locale; // idioma desta "visão" dos dados (ver viewFor)
  lang: Record<string, string>; // = langs[locale]
  fallbackLang: Record<string, string>; // en_us
  icons: IconBundle;
  atlas: AtlasPixels; // textures.webp decodificado
  programmerArt: boolean; // esta visão usa as texturas antigas?
  textures: TextureLookup;
  gui: GuiBundle;
  guiAtlas: ImageBitmap;
  font: BitmapFont;
  itemTags: Record<string, string[]>; // id do item (sem variante) → marcações
  player: PlayerData | null; // aba "Inventário" (versões publicadas antes disso não têm)
}

export interface PlayerData {
  models: PlayerModels;
  defaultSkin: Skin; // Steve (braços largos): o jogo sem conta usa uma das skins padrão
}

interface VersionList {
  latest: { release: string; snapshot: string };
}

const BASE = '/data/je';

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`falha ao carregar ${url} (${response.status})`);
  return response.json() as Promise<T>;
}

// arquivo opcional: versões publicadas antes dele existir só ficam sem a informação
async function optionalJson<T>(url: string, fallback: T): Promise<T> {
  const response = await fetch(url);
  return response.ok ? (response.json() as Promise<T>) : fallback;
}

async function image(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`falha ao carregar ${url} (${response.status})`);
  return createImageBitmap(await response.blob());
}

function pixelsOf(bitmap: ImageBitmap): AtlasPixels {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

// a fonte do jogo como fonte web, pro texto em html (painel, tooltip). sem ela, o texto cai na fonte do sistema
export const FONT_FAMILY = 'Minecraft GUI';
async function loadFontFace(base: string): Promise<void> {
  try {
    const face = new FontFace(FONT_FAMILY, `url("${base}/font/minecraft.woff2")`);
    document.fonts.add(await face.load());
  } catch {
    // versão publicada antes da fonte web existir
  }
}

export async function latestRelease(): Promise<string> {
  return (await json<VersionList>(`${BASE}/versions.json`)).latest.release;
}

export async function loadVersion(id: string, locale: Locale): Promise<VersionData> {
  const base = `${BASE}/${encodeURIComponent(id)}`;
  const [tabs, items, ptBr, enUs, icons, gui, atlas, guiAtlas, tags] = await Promise.all([
    json<{ tabs: TabInfo[] }>(`${base}/tabs.json`),
    json<Record<string, ItemInfo>>(`${base}/items.json`),
    json<Record<string, string>>(`${base}/lang/pt_br.json`),
    json<Record<string, string>>(`${base}/lang/en_us.json`),
    json<IconBundle>(`${base}/icons.json`),
    json<GuiBundle>(`${base}/gui.json`),
    image(`${base}/textures.webp`),
    image(`${base}/gui.webp`),
    optionalJson<Record<string, string[]>>(`${base}/tags.json`, {}),
  ]);
  // tags.json vem como tag → itens; a pesquisa com "#" precisa do contrário
  const itemTags: Record<string, string[]> = {};
  for (const [tag, members] of Object.entries(tags)) for (const item of members) (itemTags[item] ??= []).push(tag);
  const [font, , player] = await Promise.all([loadFont(gui.font, base), loadFontFace(base), loadPlayer(base)]);
  const langs = { pt_br: ptBr, en_us: enUs };
  const atlasPixels = pixelsOf(atlas);
  return {
    id,
    baseUrl: base,
    tabs: tabs.tabs,
    items,
    langs,
    locale,
    lang: langs[locale],
    fallbackLang: enUs,
    icons,
    atlas: atlasPixels,
    programmerArt: false,
    textures: createTextureLookup(icons, atlasPixels),
    gui,
    guiAtlas,
    font,
    itemTags,
    player,
  };
}

async function loadPlayer(base: string): Promise<PlayerData | null> {
  try {
    const [models, skin] = await Promise.all([json<PlayerModels>(`${base}/player.json`), image(`${base}/player/steve.png`)]);
    return { models, defaultSkin: { ...pixelsOf(skin), height: skin.height } };
  } catch {
    return null;
  }
}

// as texturas antigas (textures-programmer.webp) só são baixadas quando alguém liga o Programmer Art
export async function loadProgrammerAtlas(data: VersionData): Promise<AtlasPixels | null> {
  try {
    return pixelsOf(await image(`${data.baseUrl}/textures-programmer.webp`));
  } catch {
    return null; // versão sem o pacote
  }
}

// nomes dos itens no idioma de uma wiki que não é idioma da interface (wiki/<locale>.json). os idiomas da
// interface já vêm em langs. se o arquivo faltar (versão publicada antes da opção), a busca usa o inglês
export async function loadWikiNames(data: VersionData, locale: string): Promise<Record<string, string>> {
  if (locale in data.langs) return data.langs[locale as Locale];
  try {
    return await optionalJson<Record<string, string>>(`${data.baseUrl}/wiki/${locale}.json`, {});
  } catch {
    return {};
  }
}

// a mesma versão vista num idioma e com/sem Programmer Art. objeto novo = cache de ícones próprio (icons.ts)
export function viewFor(data: VersionData, locale: Locale, programmerAtlas: AtlasPixels | null): VersionData {
  const programmerArt = Boolean(programmerAtlas);
  if (data.locale === locale && data.programmerArt === programmerArt) return data;
  return {
    ...data,
    locale,
    lang: data.langs[locale],
    programmerArt,
    textures: programmerAtlas ? createTextureLookup(data.icons, data.atlas, programmerAtlas) : createTextureLookup(data.icons, data.atlas),
  };
}

// texto de um componente no idioma escolhido (cai pro inglês e, por fim, pra própria chave)
export function textOf(data: Pick<VersionData, 'lang' | 'fallbackLang'>, component: TextComponent, lang = data.lang): string {
  if (typeof component === 'string') return component;
  if ('text' in component) return component.text;
  return lang[component.translate] ?? data.fallbackLang[component.translate] ?? component.fallback ?? component.translate;
}

// sem a opção "Inventário de operador" (como no jogo, sem permissão): some a aba de operador e, da pesquisa,
// os itens que só existem nela (ex.: as variantes de quadro). as outras abas ficam onde estão (posição fixa)
export function withoutOperatorTab(data: VersionData): VersionData {
  const operator = data.tabs.find((tab) => tab.id === 'op_blocks');
  if (!operator) return data;
  const elsewhere = new Set(data.tabs.filter((tab) => tab.type === 'category' && tab !== operator).flatMap((tab) => tab.items));
  const operatorOnly = new Set(operator.items.filter((key) => !elsewhere.has(key)));
  return {
    ...data,
    tabs: data.tabs.filter((tab) => tab !== operator).map((tab) => (tab.type === 'search' ? { ...tab, items: tab.items.filter((key) => !operatorOnly.has(key)) } : tab)),
  };
}
