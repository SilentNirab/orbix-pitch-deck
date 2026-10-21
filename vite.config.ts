import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

function readableDeckRoute(request: IncomingMessage, _response: ServerResponse, next: () => void) {
  request.url = request.url?.replace(/^\/read\/?(?=\?|$)/, '/read/index.html');
  next();
}

export default defineConfig({
  server: { port: 5188, strictPort: true },
  preview: { port: 5188, strictPort: true },
  plugins: [react(), {
    name: 'orbix-deck-structured-data',
    configureServer(server) {
      server.middlewares.use(readableDeckRoute);
    },
    configurePreviewServer(server) {
      server.middlewares.use(readableDeckRoute);
    },
    async transformIndexHtml() {
      const schema = JSON.parse(await readFile('public/data/deck.jsonld', 'utf8'));
      return [{
        tag: 'script',
        attrs: { type: 'application/ld+json' },
        children: JSON.stringify(schema).replaceAll('<', '\\u003c'),
        injectTo: 'head' as const,
      }];
    },
  }],
});
