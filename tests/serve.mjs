// Minimal static file server for local preview and the visual harness.
// Intentionally dependency-free.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export function startServer(port = 4173) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';

      // Contain path traversal: resolve then verify the result is inside ROOT.
      const filePath = normalize(join(ROOT, pathname));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// Allow `npm run serve` to use this directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  await startServer(port);
  console.log(`Serving ${ROOT} at http://localhost:${port}`);
}
