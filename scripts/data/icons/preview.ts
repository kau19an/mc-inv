// prévia dos ícones: desenha uma aba (ou parte dela) numa grade parecida com a do inventário
// uso: node scripts/data/icons/preview.ts <versão> <aba> [tamanho] [pacote: default|programmer]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { renderIcon } from '../../../src/lib/icons/raster.ts';
import { CACHE_DIR } from '../lib/files.ts';
import { IconResolver } from './resolve.ts';

const [version = '26.3', tabId = 'building_blocks', sizeArg = '48', pack = 'default'] = process.argv.slice(2);
const size = Number(sizeArg);
const root = join(CACHE_DIR, 'versions', version);
const dataDir = join(import.meta.dirname, '../../../public/data/je', version);

const tabs = JSON.parse(readFileSync(join(dataDir, 'tabs.json'), 'utf8')).tabs as { id: string; items: string[] }[];
const items = JSON.parse(readFileSync(join(dataDir, 'items.json'), 'utf8')) as Record<string, { id: string }>;
const tab = tabs.find((t) => t.id === tabId);
if (!tab) throw new Error(`aba não encontrada: ${tabId}`);

const resolver = new IconResolver(root, pack === 'programmer' ? join(root, 'programmer_art') : undefined);

// grade 9 colunas, slot = ícone + 2px de borda (cinza do inventário)
const columns = 9;
const slot = size + Math.round(size / 8);
const rows = Math.ceil(tab.items.length / columns);
const png = new PNG({ width: columns * slot, height: rows * slot });
png.data.fill(0);
for (let i = 0; i < png.width * png.height; i++) png.data.set([198, 198, 198, 255], i * 4);

const report: Record<string, string[]> = { special: [], empty: [], missing: [] };
tab.items.forEach((key, index) => {
  const id = items[key]!.id;
  const { model, tints } = resolver.resolve(id);
  if (model.kind === 'special') report.special!.push(`${id} (${model.type})`);
  if (model.kind === 'empty') report.empty!.push(id);
  const icon = renderIcon(model, { size, tints, textures: resolver.texture });
  if (icon.missing.length) report.missing!.push(`${id}: ${[...new Set(icon.missing)].join(', ')}`);

  const ox = (index % columns) * slot + (slot - size) / 2;
  const oy = Math.floor(index / columns) * slot + (slot - size) / 2;
  // fundo do slot (cinza mais escuro, como no jogo)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) png.data.set([139, 139, 139, 255], ((oy + y) * png.width + ox + x) * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const a = icon.data[s + 3]! / 255;
      if (a === 0) continue;
      const d = ((oy + y) * png.width + ox + x) * 4;
      for (let c = 0; c < 3; c++) png.data[d + c] = icon.data[s + c]! * a + png.data[d + c]! * (1 - a);
    }
  }
});

const outDir = join(CACHE_DIR, 'preview');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${version}-${tabId}-${pack}.png`);
writeFileSync(out, PNG.sync.write(png));
console.log(out);
for (const [kind, list] of Object.entries(report)) if (list.length) console.log(`${kind} (${list.length}): ${list.slice(0, 40).join(' · ')}`);
