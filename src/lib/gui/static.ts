// leitura dos dados publicados no momento do build (só nas páginas .astro — usa o sistema de arquivos)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TabInfo, TextComponent } from './creative.ts';
import type { ItemInfo } from './data.ts';
import { baseId } from './routes.ts';

const DATA_DIR = join(process.cwd(), 'public/data/je');
const read = <T,>(path: string): T => JSON.parse(readFileSync(join(DATA_DIR, path), 'utf8')) as T;

export interface StaticVersion {
  id: string;
  tabs: TabInfo[];
  items: Record<string, ItemInfo>;
  name: (component: TextComponent) => string; // pt-BR, cai pro inglês
  englishName: (component: TextComponent) => string;
}

let cached: StaticVersion | null = null;

export function latestStaticVersion(): StaticVersion {
  if (cached) return cached;
  const id = read<{ latest: { release: string } }>('versions.json').latest.release;
  const tabs = read<{ tabs: TabInfo[] }>(`${id}/tabs.json`).tabs;
  const items = read<Record<string, ItemInfo>>(`${id}/items.json`);
  const ptBr = read<Record<string, string>>(`${id}/lang/pt_br.json`);
  const enUs = read<Record<string, string>>(`${id}/lang/en_us.json`);
  const text = (lang: Record<string, string>) => (component: TextComponent) =>
    typeof component === 'string' ? component : 'text' in component ? component.text : (lang[component.translate] ?? enUs[component.translate] ?? component.translate);

  // abas e itens dividem /inv/je/<id>: se um dia colidirem, o build para em vez de gerar uma url ambígua
  const itemIds = new Set(Object.keys(items).map(baseId));
  const collisions = tabs.filter((tab) => itemIds.has(tab.id)).map((tab) => tab.id);
  if (collisions.length) throw new Error(`ids de aba iguais a ids de item: ${collisions.join(', ')}`);

  cached = { id, tabs, items, name: text(ptBr), englishName: text(enUs) };
  return cached;
}

// um item por id (a primeira variante representa o grupo, ex.: enchanted_book)
export function staticItems(version: StaticVersion): { id: string; item: ItemInfo }[] {
  const seen = new Map<string, ItemInfo>();
  for (const [key, item] of Object.entries(version.items)) if (!seen.has(baseId(key))) seen.set(baseId(key), item);
  return [...seen.entries()].map(([id, item]) => ({ id, item }));
}
