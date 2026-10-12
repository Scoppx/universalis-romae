// Server locale: serve public/. Nella tappa 3 farà anche da proxy a Jev, così la chiave resta qui.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAsk } from './jev-api.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};

// Legge tutto il corpo anche oltre il limite (così la connessione si chiude pulita), ma oltre il limite restituisce null.
async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
  }
  return size > limit ? null : Buffer.concat(chunks).toString('utf8');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// Solo la pagina del gioco: JSON (così il browser chiede il permesso prima di un invio da altri siti),
// host e origine locali (contro le pagine di altri siti e il DNS rebinding).
function richiestaLocale(req) {
  const port = req.socket.localPort;
  const ammessi = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!ammessi.includes(req.headers.host)) return 403;
  const origin = req.headers.origin;
  if (origin && !ammessi.some(h => origin === `http://${h}`)) return 403;
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return 415;
  return 200;
}

async function proxyJev(req, res, ask) {
  const text = await readBody(req, 256 * 1024);
  const locale = richiestaLocale(req);
  if (locale !== 200) return sendJson(res, locale, { errore: 'richiesta non ammessa' });
  if (!ask) return sendJson(res, 503, { errore: 'Jev non disponibile: avvia il server con TYPESAFE_API_KEY' });
  if (text === null) return sendJson(res, 413, { errore: 'richiesta troppo grande' });
  let body;
  try { body = JSON.parse(text); } catch { return sendJson(res, 400, { errore: 'JSON non valido' }); }
  if (!body || body.state === undefined || typeof body.questions !== 'object' || body.questions === null) {
    return sendJson(res, 400, { errore: 'servono state e questions' });
  }
  try {
    sendJson(res, 200, await ask({ state: body.state, questions: body.questions }));
  } catch (e) {
    sendJson(res, 502, { errore: String(e.message || e) });
  }
}

export function createServer(root = ROOT, { ask = null } = {}) {
  return http.createServer(async (req, res) => {
    const pathname = req.url.split('?')[0];
    if (pathname === '/api/jev') {
      if (req.method === 'GET') return sendJson(res, 200, { disponibile: Boolean(ask) });
      if (req.method === 'POST') return proxyJev(req, res, ask);
      res.writeHead(405).end();
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let rel;
    try {
      const p = new URL(req.url, 'http://localhost').pathname;
      rel = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
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

// Solo loopback: nessun altro sulla rete vede il gioco né può spendere la chiave di Jev.
export function startServer(port = Number(process.env.PORT) || 5178, { ask } = {}) {
  const key = process.env.TYPESAFE_API_KEY;
  const scelto = ask !== undefined ? ask : key ? createAsk({ key }) : null;
  return new Promise(resolve => {
    const server = createServer(ROOT, { ask: scelto });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  console.log(`Universalis Romae su http://localhost:${server.address().port}` +
    (process.env.TYPESAFE_API_KEY ? ' (Jev disponibile)' : ' (senza TYPESAFE_API_KEY: solo regole)'));
}
