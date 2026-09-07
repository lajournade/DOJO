/**
 * Serveur DOJO : sert l'application compilee et expose une petite API JSON.
 * Zero dependance — node:http suffit, et l'application survivra sans maintenance.
 *
 *   GET  /api/state       etat complet
 *   POST /api/ops         salve d'operations, idempotente ({ opId, type, payload })
 *   GET  /api/export.csv  journal au format de l'onglet Suivit 2
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, get, save, backup } from './store.mjs';
import { applyBatch } from '../shared/ops.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 5180);
const HOST = process.env.HOST ?? '0.0.0.0';
const MAX_BODY = 4 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('corps trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Journal au format de l'onglet d'origine : separateur ';' et date FR, pour un
 * retour direct au tableur. Sans `userId`, tout le monde y passe — la colonne
 * Utilisateur permet alors de trier au tableur.
 */
function toCsv(state, userId) {
  const header = ['Utilisateur', 'Programme', 'Date', 'Exercice', 'Série', 'Répétitions', 'Charge (kg)', 'RIR'];
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/\./g, ',');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const frDate = (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const nameOf = (id) => state.users.find((u) => u.id === id)?.name ?? id ?? '';
  const lines = [header.join(';')];
  for (const log of state.logs) {
    if (userId && log.userId !== userId) continue;
    for (const e of log.entries) {
      lines.push(
        [nameOf(log.userId), log.programCode, frDate(log.date), e.exerciseName, e.setIndex, e.reps, e.weight, e.rir]
          .map(cell)
          .join(';'),
      );
    }
  }
  // BOM : sans lui, Excel et LibreOffice lisent l'UTF-8 de travers.
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

async function serveStatic(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, rel);
  try {
    if (!file.startsWith(DIST)) throw new Error('hors racine');
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
  } catch {
    // Routes de l'application : tout ce qui n'est pas un fichier retombe sur l'index.
    file = join(DIST, 'index.html');
  }
  try {
    const body = await readFile(file);
    const immutable = rel.startsWith('/assets/');
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-length': body.length,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end("Application non compilee : lancez `npm run build`.\n");
  }
}

const server = createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  try {
    if (pathname === '/api/state' && req.method === 'GET') {
      return json(res, 200, get());
    }

    if (pathname === '/api/ops' && req.method === 'POST') {
      const ops = JSON.parse(await readBody(req));
      if (!Array.isArray(ops)) return json(res, 400, { error: 'tableau attendu' });
      const state = get();
      const applied = applyBatch(state, ops);
      if (applied) await save();
      return json(res, 200, { rev: state.rev, applied });
    }

    if (pathname === '/api/export.csv') {
      const body = Buffer.from(toCsv(get(), searchParams.get('user')), 'utf8');
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="dojo-${new Date().toISOString().slice(0, 10)}.csv"`,
        'content-length': body.length,
      });
      return res.end(body);
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'route inconnue' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'methode refusee' });
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[dojo]', err);
    return json(res, 500, { error: String(err.message ?? err) });
  }
});

await load();
await backup();
// Une sauvegarde datee par jour tant que le serveur tourne.
setInterval(() => backup().catch(() => {}), 6 * 60 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`[dojo] pret sur http://${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await save();
    server.close(() => process.exit(0));
  });
}
