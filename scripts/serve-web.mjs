import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const webRoot = new URL('../web/', import.meta.url);
const artifactsRoot = new URL('../artifacts/', import.meta.url);
const port = Number(process.env.PORT || 4173);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
    const safePath = normalize(pathname).replace(/^\.\.(\/|\\|$)/, '');
    const isArtifact = safePath.startsWith('/artifacts/');
    const file = safePath === '/' ? 'index.html' : safePath.slice(1);
    const base = isArtifact ? artifactsRoot.pathname : webRoot.pathname;
    const relativeFile = isArtifact ? file.replace(/^artifacts\//, '') : file;
    const data = await readFile(join(base, relativeFile));
    res.writeHead(200, { 'content-type': types.get(extname(relativeFile)) ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, () => {
  console.log(`Replay dashboard: http://localhost:${port}`);
});
