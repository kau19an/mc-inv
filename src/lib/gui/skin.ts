// skin de um jogador pra aba "Inventário": busca pela função /api/skin (o intermediário com a Mojang) e trata a
// imagem como o jogo trata (SkinTextureDownloader.processLegacySkin):
//   - skin antiga 64×32 vira 64×64, copiando (espelhados) braço e perna direitos pros lados esquerdos
//   - a camada de baixo (cabeça, corpo, braços, pernas) é sempre opaca; nas antigas, o "chapéu" todo opaco some
import type { PlayerModelKind, Skin } from './player.ts';

export interface PlayerSkin {
  name: string; // nome com as maiúsculas certas, como a Mojang devolve
  model: PlayerModelKind;
  skin: Skin | null; // null = jogador sem skin própria (o site usa o Steve)
}

export type SkinError = 'invalid_name' | 'not_found' | 'upstream' | 'unavailable';

// cada nome é buscado uma vez por visita: a prévia do rosto (enquanto digita) e o Confirmar usam a mesma resposta.
// erro passageiro (Mojang fora, função indisponível) não fica guardado, pra dar pra tentar de novo
type SkinResult = PlayerSkin | { error: SkinError };
const cache = new Map<string, Promise<SkinResult>>();

export function fetchPlayerSkin(name: string): Promise<SkinResult> {
  const key = name.toLowerCase(); // nomes do jogo não diferenciam maiúsculas
  let request = cache.get(key);
  if (!request) {
    request = requestPlayerSkin(name).catch(() => ({ error: 'upstream' as const }));
    cache.set(key, request);
    request.then((result) => {
      if ('error' in result && (result.error === 'upstream' || result.error === 'unavailable')) cache.delete(key);
    });
  }
  return request;
}

// rosto da skin, como o jogo desenha nas listas de jogadores (PlayerFaceExtractor): frente da cabeça (8, 8) e,
// por cima, a frente do "chapéu" (40, 8), 8×8 cada
export function skinFace(skin: Skin): ImageData {
  const face = new ImageData(8, 8);
  for (const [left, top] of [[8, 8], [40, 8]] as const) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const from = ((top + y) * skin.width + left + x) * 4;
        const alpha = skin.data[from + 3]!;
        if (!alpha) continue;
        const to = (y * 8 + x) * 4;
        const a = alpha / 255;
        for (let c = 0; c < 3; c++) face.data[to + c] = Math.round(skin.data[from + c]! * a + face.data[to + c]! * (1 - a));
        face.data[to + 3] = 255;
      }
    }
  }
  return face;
}

async function requestPlayerSkin(name: string): Promise<SkinResult> {
  let response: Response;
  try {
    response = await fetch(`/api/skin?nick=${encodeURIComponent(name)}`);
  } catch {
    return { error: 'upstream' };
  }
  // sem a função (ex.: npm run dev, que só serve as páginas): a busca só funciona no site publicado
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return { error: 'unavailable' };
  const body = (await response.json()) as { error?: SkinError; name?: string; model?: PlayerModelKind; skin?: string | null };
  if (!response.ok || body.error) return { error: body.error ?? 'upstream' };
  return { name: body.name ?? name, model: body.model === 'slim' ? 'slim' : 'wide', skin: body.skin ? await decodeSkin(body.skin) : null };
}

// decodifica direto (sem fetch: a CSP só deixa o fetch falar com o próprio site, e é bom que continue assim)
async function decodeSkin(dataUrl: string): Promise<Skin> {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  return processSkin({ width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data });
}

export function processSkin(source: Skin): Skin {
  const legacy = source.height === 32;
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < Math.min(source.height, height); y++) {
    data.set(source.data.subarray(y * source.width * 4, y * source.width * 4 + Math.min(source.width, width) * 4), y * width * 4);
  }
  const at = (x: number, y: number) => (y * width + x) * 4;

  // NativeImage.copyRect(xFrom, yFrom, xOffset, yOffset, largura, altura, espelhaX, espelhaY)
  const copyRect = (xFrom: number, yFrom: number, xOffset: number, yOffset: number, w: number, h: number, mirrorX: boolean) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const from = at(xFrom + x, yFrom + y);
        const to = at(xFrom + xOffset + (mirrorX ? w - 1 - x : x), yFrom + yOffset + y);
        data.copyWithin(to, from, from + 4);
      }
    }
  };
  const setNoAlpha = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[at(x, y) + 3] = 255;
  };
  // skins antigas sem transparência no "chapéu": a região inteira some (senão cobriria a cabeça)
  const notchTransparencyHack = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (data[at(x, y) + 3]! < 128) return;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[at(x, y) + 3] = 0;
  };

  if (legacy) {
    copyRect(4, 16, 16, 32, 4, 4, true);
    copyRect(8, 16, 16, 32, 4, 4, true);
    copyRect(0, 20, 24, 32, 4, 12, true);
    copyRect(4, 20, 16, 32, 4, 12, true);
    copyRect(8, 20, 8, 32, 4, 12, true);
    copyRect(12, 20, 16, 32, 4, 12, true);
    copyRect(44, 16, -8, 32, 4, 4, true);
    copyRect(48, 16, -8, 32, 4, 4, true);
    copyRect(40, 20, 0, 32, 4, 12, true);
    copyRect(44, 20, -8, 32, 4, 12, true);
    copyRect(48, 20, -16, 32, 4, 12, true);
    copyRect(52, 20, -8, 32, 4, 12, true);
  }
  setNoAlpha(0, 0, 32, 16);
  if (legacy) notchTransparencyHack(32, 0, 64, 32);
  setNoAlpha(0, 16, 64, 32);
  setNoAlpha(16, 48, 48, 64);
  return { width, height, data };
}
