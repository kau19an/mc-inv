// GET /api/skin?nick=<nome>: a skin atual de um jogador da Edição Java, pra aba "Inventário".
// o navegador não pode chamar a Mojang direto (ela não libera CORS), então esta função é o intermediário:
//   1. nome → UUID:    api.minecraftservices.com/minecraft/profile/lookup/name/<nome>
//   2. UUID → perfil:  sessionserver.mojang.com/session/minecraft/profile/<uuid>  (propriedade "textures" em base64)
//   3. baixa a skin (e a capa, se tiver) de textures.minecraft.net
// devolve só o necessário: { name, model: "wide" | "slim", skin: data url png, cape?: data url png }.
//
// segurança: aceita só nomes válidos do jogo, só chama esses três endereços (a url da textura é conferida antes
// de baixar), limita tempo e tamanho, e não guarda nada. o cache fica na borda da Vercel (alguns minutos), pra
// não abusar da Mojang
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const TEXTURE_HOST = 'textures.minecraft.net';
const TIMEOUT_MS = 5000;
const MAX_TEXTURE_BYTES = 64 * 1024; // skins têm poucos kb (64×64)

interface Profile {
  id: string;
  name: string;
  properties?: { name: string; value: string }[];
}

interface TexturesPayload {
  textures?: {
    SKIN?: { url: string; metadata?: { model?: string } };
    CAPE?: { url: string };
  };
}

const json = (body: unknown, status: number, cacheSeconds: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // navegador: 5 min; borda da Vercel: o tempo pedido, e serve a versão antiga enquanto atualiza
      'Cache-Control': cacheSeconds > 0 ? `public, max-age=300, s-maxage=${cacheSeconds}, stale-while-revalidate=86400` : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (response.status === 404 || response.status === 204) return null;
  if (!response.ok) throw new Error(`${new URL(url).host} respondeu ${response.status}`);
  return (await response.json()) as T;
}

// baixa uma textura só se ela for mesmo do servidor de texturas da Mojang
async function texture(url: string): Promise<string> {
  const parsed = new URL(url.replace(/^http:/, 'https:'));
  if (parsed.host !== TEXTURE_HOST) throw new Error('textura fora do servidor da Mojang');
  const response = await fetch(parsed, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`textura respondeu ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_TEXTURE_BYTES) throw new Error('textura grande demais');
  // png começa com 89 50 4E 47
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw new Error('textura não é png');
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, 0);
    const nick = new URL(request.url).searchParams.get('nick')?.trim() ?? '';
    if (!NAME.test(nick)) return json({ error: 'invalid_name' }, 400, 3600);

    try {
      const account = await getJson<{ id: string; name: string }>(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(nick)}`);
      if (!account) return json({ error: 'not_found' }, 404, 600);

      const profile = await getJson<Profile>(`https://sessionserver.mojang.com/session/minecraft/profile/${encodeURIComponent(account.id)}`);
      if (!profile) return json({ error: 'not_found' }, 404, 600);
      const encoded = profile.properties?.find((property) => property.name === 'textures')?.value;
      const payload = encoded ? (JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as TexturesPayload) : {};
      const skin = payload.textures?.SKIN;
      // sem skin própria: o jogo usa uma das skins padrão (o site mostra o Steve)
      if (!skin) return json({ name: profile.name, model: 'wide', skin: null }, 200, 600);

      const [skinData, capeData] = await Promise.all([texture(skin.url), payload.textures?.CAPE ? texture(payload.textures.CAPE.url).catch(() => null) : null]);
      return json({ name: profile.name, model: skin.metadata?.model === 'slim' ? 'slim' : 'wide', skin: skinData, ...(capeData ? { cape: capeData } : {}) }, 200, 600);
    } catch (error) {
      console.error('skin:', error);
      return json({ error: 'upstream' }, 502, 0);
    }
  },
};
