// o que interessa de dentro do jogo. o resto (sons, estruturas, worldgen…) fica de fora
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// caminhos com nome antigo entram também (recipes/ e tags/items/ viraram recipe/ e tags/item/ na 1.21)
export const KEEP_PREFIXES = [
  'assets/minecraft/textures/',
  'assets/minecraft/models/',
  'assets/minecraft/items/',
  'assets/minecraft/blockstates/',
  'assets/minecraft/atlases/',
  'assets/minecraft/font/',
  'assets/minecraft/lang/',
  'data/minecraft/recipe/',
  'data/minecraft/recipes/',
  'data/minecraft/tags/item/',
  'data/minecraft/tags/items/',
];

// o pacote fica em resourcepacks/ (no jar) ou assets/minecraft/resourcepacks/ (no espelho)
export const isProgrammerArt = (path: string) => path.endsWith('resourcepacks/programmer_art.zip');

export const isKept = (path: string) => KEEP_PREFIXES.some((prefix) => path.startsWith(prefix));

export async function writeFileDeep(path: string, data: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

// cache local: .cache/ na raiz do projeto (fora do git)
export const CACHE_DIR = join(import.meta.dirname, '../../../.cache');
