import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const publicDir = path.resolve(process.cwd(), 'public');
const port = Number(process.env.PORT || 8788);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const toFilePath = (urlPath) => {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const relativePath = normalized === '/' ? 'index.html' : normalized.replace(/^[/\\]/, '');
  const fullPath = path.resolve(publicDir, relativePath);

  if (!fullPath.startsWith(publicDir)) {
    return null;
  }

  return fullPath;
};

const server = http.createServer(async (request, response) => {
  let filePath = toFilePath(request.url || '/');

  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const data = await fs.readFile(filePath);
    const contentType = contentTypes[path.extname(filePath)] || 'application/octet-stream';

    response.writeHead(200, { 'content-type': contentType });
    response.end(data);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, () => {
  console.info(`Serving public/ at http://localhost:${port}`);
  console.info(`Debug page: http://localhost:${port}/debug/`);
});
