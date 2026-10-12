// Server locale: serve public/. Nella tappa 3 farà anche da proxy a Jev, così la chiave resta qui.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};

export function createServer(root = ROOT) {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let rel;
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = path.join(root, path.normalize(rel));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('non trovato');
    }
  });
}

// Solo loopback: nessun altro sulla rete vede il gioco (né, dalla tappa 3, la chiave di Jev).
export function startServer(port = Number(process.env.PORT) || 5178) {
  return new Promise(resolve => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  console.log(`Universalis Romae su http://localhost:${server.address().port}`);
}
