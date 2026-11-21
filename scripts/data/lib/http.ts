// downloads com nova tentativa e conferência de sha-1 (o manifesto da mojang informa o hash de tudo)
import { createHash } from 'node:crypto';

const RETRIES = 3;

async function fetchOk(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'faariaz-mc-inv (https://mc.faariaz.com)' } });
      if (response.ok) return response;
      // 4xx não melhora tentando de novo
      if (response.status < 500) throw new Error(`${response.status} ${response.statusText}`);
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw new Error(`falha ao baixar ${url}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

export function sha1(data: Uint8Array): string {
  return createHash('sha1').update(data).digest('hex');
}

export async function fetchBuffer(url: string, expectedSha1?: string): Promise<Uint8Array> {
  const data = new Uint8Array(await (await fetchOk(url)).arrayBuffer());
  if (expectedSha1 && sha1(data) !== expectedSha1) throw new Error(`sha-1 não confere: ${url}`);
  return data;
}

export async function fetchJson<T>(url: string, expectedSha1?: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await fetchBuffer(url, expectedSha1))) as T;
}
