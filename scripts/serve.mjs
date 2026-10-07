import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};

export async function startServer({ root = path.join(project, 'previews'), port = 8770 } = {}) {
  root = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    let file;
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
    } catch { res.writeHead(400); res.end('Bad request'); return; }
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject);server.listen(port,'127.0.0.1',resolve); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = process.argv.includes('--site');
  const port = Number(process.env.PORT || (site ? 8771 : 8770));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const server = await startServer({root:path.join(project,site?'docs':'previews'),port});
  console.log(`${site?'Основной сайт':'Три дизайна'}: http://127.0.0.1:${server.address().port}/`);
}
