// /data/mc-inv-index.json: o índice das versões publicadas (abas e itens com os nomes em pt-BR e inglês),
// gerado no build. a página 404 usa pra achar o item de urls digitadas à mão (/inv/je/Diamante → /inv/je/diamond)
import type { APIRoute } from 'astro';
import { siteIndex } from '@/lib/gui/static.ts';

export const GET: APIRoute = () => new Response(JSON.stringify(siteIndex()), { headers: { 'Content-Type': 'application/json' } });
