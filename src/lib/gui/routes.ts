// urls do inventário. abas e itens dividem o mesmo espaço (/inv/je/<id>): os ids nunca colidem
// (conferido no build), e o id do jogo é a própria url — /inv/je/combat, /inv/je/wooden_pickaxe
export const ROOT = '/inv/je';

export type Route = { kind: 'home' } | { kind: 'tab'; id: string } | { kind: 'item'; id: string };

// "enchanted_book~c3344c57" → "enchanted_book" (variantes ainda não têm url própria)
export const baseId = (key: string) => key.split('~')[0]!;

export function pathOf(route: Route): string {
  return route.kind === 'home' ? ROOT : `${ROOT}/${route.id}`;
}

export function parseRoute(pathname: string, tabIds: Set<string>, itemIds: Set<string>): Route | null {
  const rest = pathname.replace(/\/+$/, '').slice(ROOT.length).replace(/^\//, '');
  if (!pathname.startsWith(ROOT)) return null;
  if (!rest) return { kind: 'home' };
  const id = decodeURIComponent(rest.split('/')[0]!);
  if (tabIds.has(id)) return { kind: 'tab', id };
  if (itemIds.has(id)) return { kind: 'item', id };
  return null;
}

// título da aba do navegador, no mesmo formato do Base.astro
export const documentTitle = (page: string) => `${page} - Faariaz`;
export const SITE_SECTION = 'Inventário do Minecraft';
