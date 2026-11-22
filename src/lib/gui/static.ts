// índice das versões publicadas, lido no momento do build (só nas páginas .astro e endpoints: usa o sistema de
// arquivos). o CI escreve src/data/mc-inv-index.json depois de publicar os dados no R2 (scripts/data/publish.ts):
// abas da release mais recente + todos os itens de todas as versões, com os nomes em pt-BR e inglês, pra todo item
// ter a sua página /inv/je/<id>, seja qual for a versão escolhida no site
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

let cached: SiteIndex | null = null;

export function siteIndex(): SiteIndex {
  if (cached) return cached;
  const index = JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as SiteIndex;

  // abas e itens dividem /inv/je/<id>: se um dia colidirem, o build para em vez de gerar uma url ambígua
  const collisions = index.tabs.filter((tab) => tab.id in index.items).map((tab) => tab.id);
  if (collisions.length) throw new Error(`ids de aba iguais a ids de item: ${collisions.join(', ')}`);

  cached = index;
  return cached;
}
