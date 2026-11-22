// marcações (tags) de item de uma versão, já resolvidas: "#minecraft:logs" dentro de outra tag vira a lista de itens.
// saída: { "pickaxes": ["wooden_pickaxe", …], "c:ingots": […] } — tags do namespace minecraft sem o prefixo
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type Entry = string | { id: string; required?: boolean };

function listJson(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listJson(path) : name.endsWith('.json') ? [path] : [];
  });
}

const strip = (id: string) => id.replace(/^minecraft:/, '');

export function buildItemTags(versionDir: string, knownItems: Set<string>): Record<string, string[]> {
  const raw = new Map<string, Entry[]>();
  const dataDir = join(versionDir, 'data');
  if (!existsSync(dataDir)) return {};
  for (const namespace of readdirSync(dataDir)) {
    // "item" desde a 1.21; "items" antes disso
    for (const folder of ['tags/item', 'tags/items']) {
      const dir = join(dataDir, namespace, folder);
      if (!existsSync(dir)) continue;
      for (const file of listJson(dir)) {
        const name = relative(dir, file).replace(/\\/g, '/').replace(/\.json$/, '');
        const values = (JSON.parse(readFileSync(file, 'utf8')) as { values?: Entry[] }).values ?? [];
        raw.set(strip(`${namespace}:${name}`), values);
      }
    }
  }

  const resolved = new Map<string, Set<string>>();
  const resolve = (tag: string, trail: Set<string>): Set<string> => {
    const done = resolved.get(tag);
    if (done) return done;
    const out = new Set<string>();
    if (trail.has(tag)) return out; // proteção contra ciclo
    trail.add(tag);
    for (const entry of raw.get(tag) ?? []) {
      const id = typeof entry === 'string' ? entry : entry.id;
      if (id.startsWith('#')) resolve(strip(id.slice(1)), trail).forEach((item) => out.add(item));
      else if (knownItems.has(strip(id))) out.add(strip(id));
    }
    trail.delete(tag);
    resolved.set(tag, out);
    return out;
  };

  return Object.fromEntries(
    [...raw.keys()]
      .sort()
      .map((tag) => [tag, [...resolve(tag, new Set())].sort()] as const)
      .filter(([, items]) => items.length > 0),
  );
}
