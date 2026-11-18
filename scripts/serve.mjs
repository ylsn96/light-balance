import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import { assets } from './assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
export function createServer(base = '/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be a slash-delimited directory path');
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      if (!url.pathname.startsWith(base)) { response.writeHead(404).end('Not found'); return; }
      const path = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
      if (!assets.includes(path)) { response.writeHead(404).end('Not found'); return; }
      const data = await readFile(resolve(root, path));
      response.writeHead(200, { 'Content-Type': types[extname(path)], 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.argv.find(a => a.startsWith('--port='))?.slice(7) ?? 4188);
  const base = process.argv.find(a => a.startsWith('--base='))?.slice(7) ?? '/';
  const server = createServer(base);
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Light Balance ready at http://localhost:${port}${base}`));
}
