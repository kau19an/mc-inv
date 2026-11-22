// índice das versões publicadas, lido no momento do build (só nas páginas .astro e endpoints: usa o sistema de
// arquivos). o CI escreve src/data/mc-inv-index.json depois de publicar os dados no R2 (scripts/data/publish.ts):
// abas da release mais recente + todos os itens de todas as versões, com os nomes em pt-BR e inglês, pra todo item
// ter a sua página /inv/je/<id>, seja qual for a versão escolhida no site
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TabInfo, TextComponent } from './creative.ts';
import type { ItemInfo } from './data.ts';

export interface IndexNames {
  pt: string;
  en: string;
}
export interface SiteIndex {
  release: string | null; // versão de onde vieram as abas
  tabs: (IndexNames & { id: string })[];
  items: Record<string, IndexNames>; // id → nomes
}

const INDEX_FILE = join(process.cwd(), 'src/data/mc-inv-index.json');
// transição: enquanto o índice não existir, monta o mesmo formato a partir dos dados antigos em public/data/je
const LEGACY_DIR = join(process.cwd(), 'public/data/je');

let cached: SiteIndex | null = null;

export function siteIndex(): SiteIndex {
  if (cached) return cached;
  const index = existsSync(INDEX_FILE) ? (JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as SiteIndex) : legacyIndex();

  // abas e itens dividem /inv/je/<id>: se um dia colidirem, o build para em vez de gerar uma url ambígua
  const collisions = index.tabs.filter((tab) => tab.id in index.items).map((tab) => tab.id);
  if (collisions.length) throw new Error(`ids de aba iguais a ids de item: ${collisions.join(', ')}`);

  cached = index;
  return cached;
}

function legacyIndex(): SiteIndex {
  const read = <T,>(path: string): T => JSON.parse(readFileSync(join(LEGACY_DIR, path), 'utf8')) as T;
  const list = read<{ latest: { release: string }; versions: { id: string }[] }>('versions.json');
  const release = list.latest.release;
  const items: SiteIndex['items'] = {};
  let tabs: SiteIndex['tabs'] = [];
  for (const version of [release, ...list.versions.map((entry) => entry.id).filter((other) => other !== release)]) {
    const ptBr = read<Record<string, string>>(`${version}/lang/pt_br.json`);
    const enUs = read<Record<string, string>>(`${version}/lang/en_us.json`);
    const text = (lang: Record<string, string>, component: TextComponent) =>
      typeof component === 'string' ? component : 'text' in component ? component.text : (lang[component.translate] ?? enUs[component.translate] ?? component.translate);
    const names = (component: TextComponent): IndexNames => ({ pt: text(ptBr, component), en: text(enUs, component) });
    if (version === release) tabs = read<{ tabs: TabInfo[] }>(`${version}/tabs.json`).tabs.map((tab) => ({ id: tab.id, ...names(tab.name) }));
    for (const item of Object.values(read<Record<string, ItemInfo>>(`${version}/items.json`))) items[item.id] ??= names(item.name);
  }
  return { release, tabs, items };
}
