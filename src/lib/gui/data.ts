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
  tabs: TabInfo[];
  items: Record<string, ItemInfo>;
  lang: Record<string, string>; // idioma da interface
  fallbackLang: Record<string, string>; // en_us
  icons: IconBundle;
  textures: TextureLookup;
  gui: GuiBundle;
  guiAtlas: ImageBitmap;
  font: BitmapFont;
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

export async function latestRelease(): Promise<string> {
  return (await json<VersionList>(`${BASE}/versions.json`)).latest.release;
}

export async function loadVersion(id: string, locale: string): Promise<VersionData> {
  const base = `${BASE}/${encodeURIComponent(id)}`;
  const [tabs, items, lang, fallbackLang, icons, gui, atlas, guiAtlas] = await Promise.all([
    json<{ tabs: TabInfo[] }>(`${base}/tabs.json`),
    json<Record<string, ItemInfo>>(`${base}/items.json`),
    json<Record<string, string>>(`${base}/lang/${locale}.json`),
    locale === 'en_us' ? Promise.resolve({}) : json<Record<string, string>>(`${base}/lang/en_us.json`),
    json<IconBundle>(`${base}/icons.json`),
    json<GuiBundle>(`${base}/gui.json`),
    image(`${base}/textures.webp`),
    image(`${base}/gui.webp`),
  ]);
  const font = await loadFont(gui.font, base);
  return {
    id,
    tabs: tabs.tabs,
    items,
    lang,
    fallbackLang: locale === 'en_us' ? lang : fallbackLang,
    icons,
    textures: createTextureLookup(icons, pixelsOf(atlas)),
    gui,
    guiAtlas,
    font,
  };
}

// texto de um componente no idioma escolhido (cai pro inglês e, por fim, pra própria chave)
export function textOf(data: Pick<VersionData, 'lang' | 'fallbackLang'>, component: TextComponent, lang = data.lang): string {
  if (typeof component === 'string') return component;
  if ('text' in component) return component.text;
  return lang[component.translate] ?? data.fallbackLang[component.translate] ?? component.fallback ?? component.translate;
}
