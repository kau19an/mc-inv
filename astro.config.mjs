// @ts-check
import { defineConfig } from 'astro/config';
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
        "img-src 'self' data:", // ícones e texturas são servidos pelo próprio site
        "font-src 'self'", // a fonte do jogo também
        "connect-src 'self'", // jsons de dados e índices de busca
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

  // preact só nas ilhas interativas (o resto é html puro, zero js)
  integrations: [preact()],

  vite: {
    plugins: [tailwindcss(), devFunctions()],
  },
});
