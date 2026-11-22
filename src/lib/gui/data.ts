// carrega tudo que a tela do criativo precisa de uma versão (public/data/je/<versão>/) no navegador
import { createTextureLookup, type AtlasPixels, type IconBundle } from '../icons/bundle.ts';
import type { TextureLookup } from '../icons/types.ts';
import type { TabInfo, TextComponent } from './creative.ts';
import { loadFont, type BitmapFont } from './font.ts';
import type { GuiBundle } from './types.ts';

export interface ItemInfo {
  id: string;
  name: TextComponent;
  components?: Record<string, unknown>;
}

export interface VersionData {
  id: string;
  baseUrl: string; // /data/je/<versão>
  tabs: TabInfo[];
  items: Record<string, ItemInfo>;
  lang: Record<string, string>; // idioma da interface
  fallbackLang: Record<string, string>; // en_us
  icons: IconBundle;
  textures: TextureLookup;
  gui: GuiBundle;
  guiAtlas: ImageBitmap;
  font: BitmapFont;
  itemTags: Record<string, string[]>; // id do item (sem variante) → marcações
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

export async function loadVersion(id: string, locale: string): Promise<VersionData> {
  const base = `${BASE}/${encodeURIComponent(id)}`;
  const [tabs, items, lang, fallbackLang, icons, gui, atlas, guiAtlas, tags] = await Promise.all([
    json<{ tabs: TabInfo[] }>(`${base}/tabs.json`),
    json<Record<string, ItemInfo>>(`${base}/items.json`),
    json<Record<string, string>>(`${base}/lang/${locale}.json`),
    locale === 'en_us' ? Promise.resolve({}) : json<Record<string, string>>(`${base}/lang/en_us.json`),
    json<IconBundle>(`${base}/icons.json`),
    json<GuiBundle>(`${base}/gui.json`),
    image(`${base}/textures.webp`),
    image(`${base}/gui.webp`),
    optionalJson<Record<string, string[]>>(`${base}/tags.json`, {}),
  ]);
  // tags.json vem como tag → itens; o painel precisa do contrário
  const itemTags: Record<string, string[]> = {};
  for (const [tag, members] of Object.entries(tags)) for (const item of members) (itemTags[item] ??= []).push(tag);
  const [font] = await Promise.all([loadFont(gui.font, base), loadFontFace(base)]);
  return {
    id,
    baseUrl: base,
    tabs: tabs.tabs,
    items,
    lang,
    fallbackLang: locale === 'en_us' ? lang : fallbackLang,
    icons,
    textures: createTextureLookup(icons, pixelsOf(atlas)),
    gui,
    guiAtlas,
    font,
    itemTags,
  };
}

// texto de um componente no idioma escolhido (cai pro inglês e, por fim, pra própria chave)
export function textOf(data: Pick<VersionData, 'lang' | 'fallbackLang'>, component: TextComponent, lang = data.lang): string {
  if (typeof component === 'string') return component;
  if ('text' in component) return component.text;
  return lang[component.translate] ?? data.fallbackLang[component.translate] ?? component.fallback ?? component.translate;
}
