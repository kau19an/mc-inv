// ícone de item num canvas, no tamanho pedido (em pixels reais) — com cache, porque a mesma picareta
// aparece na grade, na aba e no painel
import { iconFor } from '../icons/bundle.ts';
import { renderIcon } from '../icons/raster.ts';
import type { VersionData } from './data.ts';

const caches = new WeakMap<VersionData, Map<string, HTMLCanvasElement | null>>();

export function iconCanvas(data: VersionData, key: string, size: number): HTMLCanvasElement | null {
  let cache = caches.get(data);
  if (!cache) caches.set(data, (cache = new Map()));
  const cacheKey = `${key}|${size}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  const found = iconFor(data.icons, key);
  let canvas: HTMLCanvasElement | null = null;
  if (found) {
    const rendered = renderIcon(found.model, { size, tints: found.tints, textures: data.textures });
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d')!.putImageData(new ImageData(rendered.data as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  }
  cache.set(cacheKey, canvas);
  return canvas;
}

// alfa do ícone (1 onde tem pixel), pro brilho de encantamento saber onde desenhar
const masks = new WeakMap<HTMLCanvasElement, Uint8Array>();
export function iconMask(data: VersionData, key: string, size: number): Uint8Array | null {
  const canvas = iconCanvas(data, key, size);
  if (!canvas) return null;
  let mask = masks.get(canvas);
  if (!mask) {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, size, size).data;
    mask = new Uint8Array(size * size);
    for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3]! > 0 ? 1 : 0;
    masks.set(canvas, mask);
  }
  return mask;
}
