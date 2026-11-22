// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// no `npm run dev` (Codespaces, PC), roda as funções da pasta api/ do mesmo jeito que a Vercel: o pedido em
// /api/<nome> vai pro `fetch` exportado por api/<nome>.ts. só existe em desenvolvimento; no site publicado,
// quem responde é a própria Vercel
/** @returns {import('vite').Plugin} */
function devFunctions() {
  return {
    name: 'mc-inv:dev-functions',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/api\/([a-z0-9-]+)(?:\?|$)/.exec(req.url ?? '');
        if (!match) return next();
        try {
          const module = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method });
          const response = await module.default.fetch(request);
          res.statusCode = response.status;
          response.headers.forEach((/** @type {string} */ value, /** @type {string} */ key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(`[api/${match[1]}] ${error}`);
          next();
        }
      });
    },
  };
}

// domínio dos dados do jogo (cloudflare r2). padrão: os publicados, em todo lugar (site, npm run dev, codespaces).
// PUBLIC_DATA_URL=local usa public/data/je do próprio site (dados gerados no computador com npm run build-data).
// entra na csp abaixo: jsons, imagens e a fonte do jogo vêm de lá
const DEFAULT_DATA_URL = 'https://mc-data.faariaz.com';
const { PUBLIC_DATA_URL = DEFAULT_DATA_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const dataOrigin = PUBLIC_DATA_URL === 'local' ? '' : new URL(PUBLIC_DATA_URL).origin;
/** @template {string} T @param {T} directive @returns {T} (só acrescenta a origem no fim: o tipo da diretiva continua o mesmo) */
const withData = (directive) => /** @type {T} */ (dataOrigin ? `${directive} ${dataOrigin}` : directive);

// https://astro.build/config
export default defineConfig({
  // domínio oficial (canonical, og). a raiz fica reservada pro hub; o inventário mora em /inv
  site: 'https://mc.faariaz.com',

  // site estático: os dados saem do jar no build. a única parte de servidor é a função api/skin.ts (Vercel Function)
  output: 'static',

  // urls sem barra no final (/inv/je, não /inv/je/). o vercel.json segue a mesma regra
  trailingSlash: 'never',

  // segurança: o Astro gera a CSP já com o hash de cada script/estilo que ele mesmo renderiza (scripts de fora não rodam).
  // frame-ancestors e HSTS não funcionam em <meta>, então ficam como cabeçalho no vercel.json
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        withData("img-src 'self' data:"), // ícones, texturas e panoramas (domínio de dados)
        withData("font-src 'self'"), // a fonte do jogo também
        withData("connect-src 'self'"), // jsons de dados e índice das páginas
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // beacon da cloudflare web analytics (a cloudflare injeta sozinha por ser o proxy do domínio). só esse caminho, não o host todo
      scriptDirective: { resources: ["'self'", 'https://static.cloudflareinsights.com/beacon.min.js', 'https://static.cloudflareinsights.com/beacon.min.js/'] },
      // atributos style="..." liberados (posição dos ícones na spritesheet, escala da gui); <style> e <script> seguem com hash
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
    },
  },

  // variáveis de ambiente com tipo (import de 'astro:env/client')
  env: {
    schema: {
      PUBLIC_DATA_URL: envField.string({ context: 'client', access: 'public', default: DEFAULT_DATA_URL }),
    },
  },

  // preact só nas ilhas interativas (o resto é html puro, zero js)
  integrations: [preact()],

  vite: {
    plugins: [tailwindcss(), devFunctions()],
  },
});
