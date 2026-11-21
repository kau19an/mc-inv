// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // domínio oficial (canonical, og). a raiz fica reservada pro hub; o inventário mora em /inv
  site: 'https://mc.faariaz.com',

  // site 100% estático: os dados saem do jar no build, então não precisa de servidor nem banco
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
    plugins: [tailwindcss()],
  },
});
