// npm run build-data — transforma o que o pipeline extraiu (.cache) nos jsons que o site usa (public/data/je)
//
// para cada versão acompanhada que tenha dump das abas:
//   public/data/je/<id>/tabs.json            abas na ordem do jogo, com a lista de itens (chaves de items.json)
//   public/data/je/<id>/items.json           cada item uma vez só: id, nome (componente de texto) e componentes
//   public/data/je/<id>/lang/<locale>.json   só as traduções usadas pelo inventário
//   public/data/je/<id>/wiki/<locale>.json   nomes dos itens nos idiomas das outras wikis (opção Minecraft Wiki)
//   public/data/je/<id>/tags.json            marcações de item já resolvidas (tag → itens)
//   public/data/je/<id>/player.json          modelo do jogador (peças separadas) + player/steve.png e player/alex.png
//   public/data/je/versions.json             versões disponíveis no site
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { CACHE_DIR } from './lib/files.ts';
import type { VersionKind } from './lib/versions.ts';
import { buildIconBundle, toWebp } from './icons/bundle.ts';
import { buildGuiBundle } from './gui.ts';
import { buildItemTags } from './tags.ts';
import { UI_KEYS } from '../../src/lib/gui/ui-keys.ts';
import { WIKI_LANGUAGES } from '../../src/lib/gui/wiki.ts';
import type { SpecialMeshes } from './icons/resolve.ts';

// idiomas expostos na interface por enquanto (a busca multilíngue usa todos, mas isso vem na fase 4)
const LOCALES = ['en_us', 'pt_br'];
const OUT_DIR = join(import.meta.dirname, '../../public/data/je');

// o que o dumper grava (scripts/data/dumper/CreativeTabsDump.java)
type TextComponent = string | { translate?: string; with?: TextComponent[]; extra?: TextComponent[]; [key: string]: unknown };
interface DumpedStack {
  id: string;
  count?: number;
  name: TextComponent;
  components?: Record<string, unknown>;
  tooltip?: TextComponent[]; // linhas da tooltip normal, montadas pelo jogo (a primeira é o nome, já com a cor da raridade)
  tooltipAdvanced?: TextComponent[]; // com F3+H (id, durabilidade, contagem de componentes…)
}
interface DumpedTab {
  id: string;
  type: 'category' | 'hotbar' | 'search' | 'inventory';
  row: 'top' | 'bottom';
  column: number;
  alignedRight: boolean;
  showTitle: boolean;
  canScroll: boolean;
  background: string;
  name: TextComponent;
  icon: DumpedStack;
  items: DumpedStack[];
}
interface Dump {
  version: string;
  tabs: DumpedTab[];
}

const stripNamespace = (id: string) => id.replace(/^minecraft:/, '');

// json com chaves em ordem: o mesmo conteúdo sempre vira o mesmo texto (hash estável, diff limpo no git)
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableStringify(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// chave do item: o id puro quando não tem componentes ("oak_log"); com componentes, id + hash curto
// ("potion~1a2b3c4d"). os nomes legíveis pra url (potion/swiftness) entram na fase 4
function itemKey(stack: DumpedStack): string {
  const id = stripNamespace(stack.id);
  if (!stack.components && !stack.count) return id;
  const hash = createHash('sha1').update(stableStringify({ components: stack.components, count: stack.count })).digest('hex').slice(0, 8);
  return `${id}~${hash}`;
}

// todas as chaves de tradução de um componente de texto (inclusive as aninhadas em "with"/"extra")
function collectKeys(component: TextComponent, keys: Set<string>): void {
  if (!component || typeof component !== 'object') return; // texto puro, número ou booleano (argumentos de "with")
  if (component.translate) keys.add(component.translate);
  for (const child of [...(component.with ?? []), ...(component.extra ?? [])]) collectKeys(child, keys);
}

// o dump monta a tooltip sem jogador (não dá pra criar um sem um mundo). com jogador, o jogo soma os atributos
// base dele aos modificadores base da arma na mão principal e mostra o total em verde-escuro, com um espaço na
// frente: "+6 Dano de ataque" (azul) vira " 7 Dano de ataque". valores base do jogador: dano 1, velocidade 4
// (Player.createAttributes); formato dos números: "#.##" com ponto (ItemAttributeModifiers)
const PLAYER_BASE: Record<string, number> = { 'attribute.name.attack_damage': 1, 'attribute.name.attack_speed': 4 };
const formatAmount = (value: number) => String(Math.round(value * 100) / 100);

function withPlayerBase(lines: TextComponent[]): TextComponent[] {
  let inMainHand = false;
  const done = new Set<string>();
  return lines.map((line) => {
    if (typeof line !== 'object' || !line) return line;
    if (typeof line.translate === 'string' && line.translate.startsWith('item.modifiers.')) {
      inMainHand = line.translate === 'item.modifiers.mainhand';
      return line;
    }
    const match = typeof line.translate === 'string' ? /^attribute\.modifier\.(plus|take)\.0$/.exec(line.translate) : null;
    const [amount, attribute] = (line.with ?? []) as [TextComponent, TextComponent];
    const attributeKey = typeof attribute === 'object' && attribute ? attribute.translate : undefined;
    if (!inMainHand || !match || !attributeKey || !(attributeKey in PLAYER_BASE) || done.has(attributeKey)) return line;
    done.add(attributeKey);
    const value = (match[1] === 'take' ? -1 : 1) * Number(amount) + PLAYER_BASE[attributeKey]!;
    return { text: ' ', color: 'dark_green', extra: [{ translate: 'attribute.modifier.equals.0', with: [formatAmount(value), attribute] }] };
  });
}

// tooltip publicada: a normal inteira; da avançada, normalmente só as linhas que ela acrescenta no fim
// ("advancedExtra"). se ela mudar algo no meio, vai inteira ("advanced")
function tooltipFields(stack: DumpedStack): { tooltip?: TextComponent[]; advanced?: TextComponent[]; advancedExtra?: TextComponent[] } {
  if (!stack.tooltip) return {};
  const normal = withPlayerBase(stack.tooltip);
  const advanced = withPlayerBase(stack.tooltipAdvanced ?? stack.tooltip);
  const same = (a: TextComponent, b: TextComponent) => stableStringify(a) === stableStringify(b);
  const isPrefix = normal.length <= advanced.length && normal.every((line, index) => same(line, advanced[index]!));
  if (isPrefix) return advanced.length > normal.length ? { tooltip: normal, advancedExtra: advanced.slice(normal.length) } : { tooltip: normal };
  return { tooltip: normal, advanced };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

const writeJson = (path: string, data: unknown) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`);

async function buildVersion(id: string) {
  const versionDir = join(CACHE_DIR, 'versions', id);
  const dump = await readJson<Dump>(join(versionDir, 'creative_tabs.json'));

  type PublishedItem = { id: string; count?: number; name: TextComponent; components?: Record<string, unknown>; tooltip?: TextComponent[]; advanced?: TextComponent[]; advancedExtra?: TextComponent[] };
  const items: Record<string, PublishedItem> = {};
  const usedKeys = new Set<string>();
  const nameKeys = new Set<string>(); // só os nomes dos itens (busca na wiki em outros idiomas)
  const register = (stack: DumpedStack) => {
    const key = itemKey(stack);
    if (!items[key]) {
      items[key] = { id: stripNamespace(stack.id), ...(stack.count ? { count: stack.count } : {}), name: stack.name, ...(stack.components ? { components: stack.components } : {}), ...tooltipFields(stack) };
      collectKeys(stack.name, usedKeys);
      collectKeys(stack.name, nameKeys);
      for (const line of [...(stack.tooltip ?? []), ...(stack.tooltipAdvanced ?? [])]) collectKeys(line, usedKeys);
      usedKeys.add('attribute.modifier.equals.0');
    }
    return key;
  };

  const tabs = dump.tabs.map((tab) => {
    collectKeys(tab.name, usedKeys);
    return {
      id: stripNamespace(tab.id),
      type: tab.type,
      row: tab.row,
      column: tab.column,
      alignedRight: tab.alignedRight,
      showTitle: tab.showTitle,
      canScroll: tab.canScroll,
      background: tab.background,
      name: tab.name,
      icon: register(tab.icon),
      items: tab.items.map(register),
    };
  });

  // textos da interface que vêm do jogo (opções, botões)
  for (const key of Object.values(UI_KEYS)) usedKeys.add(key);

  // traduções: só as chaves usadas. se faltar alguma no idioma, o site cai no en_us
  const lang: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    const full = await readJson<Record<string, string>>(join(versionDir, 'assets/minecraft/lang', `${locale}.json`));
    lang[locale] = Object.fromEntries([...usedKeys].sort().filter((key) => key in full).map((key) => [key, full[key]]));
  }

  const outDir = join(OUT_DIR, id);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'lang'), { recursive: true });
  await writeJson(join(outDir, 'tabs.json'), { version: id, gameVersion: dump.version, tabs });
  await writeJson(join(outDir, 'items.json'), items);
  for (const locale of LOCALES) await writeJson(join(outDir, 'lang', `${locale}.json`), lang[locale]);
  // nomes dos itens nos idiomas das outras wikis (opção "Minecraft Wiki" com idioma fixo). baixado só quando
  // alguém escolhe aquela wiki; os idiomas da interface já têm tudo em lang/
  await mkdir(join(outDir, 'wiki'), { recursive: true });
  for (const { locale } of WIKI_LANGUAGES) {
    if (LOCALES.includes(locale)) continue;
    const path = join(versionDir, 'assets/minecraft/lang', `${locale}.json`);
    if (!existsSync(path)) {
      console.log(`::warning title=Idioma da wiki ausente::${id}: ${locale}.json não veio com o jogo (a busca nessa wiki usa o nome em inglês)`);
      continue;
    }
    const full = await readJson<Record<string, string>>(path);
    await writeJson(join(outDir, 'wiki', `${locale}.json`), Object.fromEntries([...nameKeys].sort().filter((key) => key in full).map((key) => [key, full[key]])));
  }
  await writeJson(join(outDir, 'tags.json'), buildItemTags(versionDir, new Set(Object.values(items).map((item) => stripNamespace(item.id)))));
  // pacote de ícones (modelos resolvidos + atlas de texturas em webp sem perdas). a geometria dos modelos
  // especiais (baú, estandarte…), exportada pelo jogo no dump, entra aqui dentro
  const specialsFile = join(versionDir, 'specials.json');
  const meshes = existsSync(specialsFile) ? await readJson<SpecialMeshes>(specialsFile) : {};
  const icons = buildIconBundle(versionDir, Object.values(items).map((item) => item.id), meshes);
  await writeFile(join(outDir, 'icons.json'), JSON.stringify(icons.bundle));
  await writeFile(join(outDir, 'textures.webp'), await toWebp(icons.atlas));
  if (icons.programmerAtlas) await writeFile(join(outDir, 'textures-programmer.webp'), await toWebp(icons.programmerAtlas));
  // interface da tela do criativo (fundos, abas, rolagem, destaque) + fonte do jogo
  const gui = await buildGuiBundle(versionDir, [...new Set(tabs.map((tab) => tab.background))]);
  await writeFile(join(outDir, 'gui.json'), JSON.stringify(gui.bundle));
  await writeFile(join(outDir, 'gui.webp'), await toWebp(gui.atlas));
  await mkdir(join(outDir, 'font'), { recursive: true });
  for (const [name, data] of Object.entries(gui.fontFiles)) await writeFile(join(outDir, 'font', name), data);

  // modelo do jogador (aba "Inventário") + skins padrão: Steve (braços largos) e Alex (braços finos)
  const playerFile = join(versionDir, 'player.json');
  if (existsSync(playerFile)) {
    await writeFile(join(outDir, 'player.json'), JSON.stringify(await readJson(playerFile)));
    await mkdir(join(outDir, 'player'), { recursive: true });
    for (const [model, skin] of [['wide', 'steve'], ['slim', 'alex']]) {
      await writeFile(join(outDir, 'player', `${skin}.png`), await readFile(join(versionDir, 'assets/minecraft/textures/entity/player', model!, `${skin}.png`)));
    }
  }

  const blank = Object.values(icons.bundle.items).filter(([index]) => ['empty', 'special'].includes(icons.bundle.models[index]!.kind)).length;
  if (blank) console.log(`::warning title=Ícones sem modelo::${id}: ${blank} itens sem ícone (vazio ou especial sem malha)`);

  // validação: um idioma sem a maior parte das traduções indica arquivo errado ou formato novo
  for (const locale of LOCALES) {
    const found = Object.keys(lang[locale]!).length;
    if (found < usedKeys.size * 0.9) {
      const path = join(versionDir, 'assets/minecraft/lang', `${locale}.json`);
      const raw = await readFile(path, 'utf8');
      const detail = `${id}/${locale}: ${found} de ${usedKeys.size} traduções. arquivo com ${raw.length} caracteres, começa com: ${raw.slice(0, 300)}`;
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=Idioma incompleto::${detail.replaceAll('\n', '%0A')}`);
      throw new Error(detail);
    }
  }

  const missing = LOCALES.map((locale) => `${locale}: ${usedKeys.size - Object.keys(lang[locale]!).length}`).join(', ');
  console.log(`✓ ${id}: ${tabs.length} abas, ${Object.keys(items).length} itens únicos, ${usedKeys.size} traduções (faltando → ${missing})`);
  return { items: Object.keys(items).length, translations: usedKeys.size };
}

// versões classificadas pelo npm run data
const catalog = await readJson<{ latest: { release: string; snapshot: string }; versions: { id: string; kind: VersionKind; releaseTime: string }[] }>(
  join(CACHE_DIR, 'versions.json'),
);
const available = (await readdir(join(CACHE_DIR, 'versions'))).filter((id) => existsSync(join(CACHE_DIR, 'versions', id, 'creative_tabs.json')));
if (available.length === 0) throw new Error('nenhuma versão com dump das abas: rode npm run data e npm run dump antes');

for (const id of available) await buildVersion(id);

// só ficam no site as versões geradas agora (quando sai uma release nova, a anterior sai junto, por enquanto)
for (const entry of existsSync(OUT_DIR) ? await readdir(OUT_DIR, { withFileTypes: true }) : []) {
  if (entry.isDirectory() && !available.includes(entry.name)) await rm(join(OUT_DIR, entry.name), { recursive: true, force: true });
}

const versions = catalog.versions
  .filter((version) => available.includes(version.id))
  .map(({ id, kind, releaseTime }) => ({ id, kind, releaseTime }));
const pick = (wanted: string) => (available.includes(wanted) ? wanted : null);
await writeJson(join(OUT_DIR, 'versions.json'), {
  latest: { release: pick(catalog.latest.release), snapshot: pick(catalog.latest.snapshot) },
  versions,
});
