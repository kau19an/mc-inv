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

// a release mais recente (abas e nomes) + os itens que só existem nas outras versões publicadas (ex.: os blocos
// novos de uma snapshot), pra todo item ter a sua página /inv/je/<id>, seja qual for a versão escolhida no site
export function latestStaticVersion(): StaticVersion {
  if (cached) return cached;
  const list = read<{ latest: { release: string }; versions: { id: string }[] }>('versions.json');
  const id = list.latest.release;
  const tabs = read<{ tabs: TabInfo[] }>(`${id}/tabs.json`).tabs;
  const items: Record<string, ItemInfo> = {};
  const ptBr: Record<string, string> = {};
  const enUs: Record<string, string> = {};
  for (const version of [id, ...list.versions.map((entry) => entry.id).filter((other) => other !== id)]) {
    const fill = <T,>(target: Record<string, T>, source: Record<string, T>) => {
      for (const [key, value] of Object.entries(source)) if (!(key in target)) target[key] = value;
    };
    fill(items, read<Record<string, ItemInfo>>(`${version}/items.json`));
    fill(ptBr, read<Record<string, string>>(`${version}/lang/pt_br.json`));
    fill(enUs, read<Record<string, string>>(`${version}/lang/en_us.json`));
  }
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
