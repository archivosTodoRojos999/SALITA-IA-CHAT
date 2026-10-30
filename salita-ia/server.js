// Servidor LOCAL de Salita IA (para probar en tu compu). En Vercel se usan los archivos de /api.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chat from './api/chat.js';
import extract from './api/extract.js';
import status from './api/status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const MAX_BODY = 50 * 1024 * 1024;

const ROUTES = { '/api/chat': chat, '/api/extract': extract, '/api/status': status };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('Pedido demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const handler = ROUTES[url.pathname];
    if (handler) {
      // adaptador mínimo para que los handlers de Vercel funcionen acá también
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
      if (req.method === 'POST') { try { req.body = JSON.parse(await readBody(req)); } catch { req.body = {}; } }
      return await handler(req, res);
    }
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const fp = path.normalize(path.join(PUBLIC, p));
    if (!fp.startsWith(PUBLIC) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => {
  console.log(`\n  💙 Salita IA lista en http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) console.log('  ⚠️  Falta configurar GEMINI_API_KEY o ANTHROPIC_API_KEY\n');
});
