// Local static previews only. No receiver, request proxy, or outside-origin access.
const assert = require('node:assert/strict');
const http = require('node:http');
const { createReadStream, existsSync, statSync } = require('node:fs');
const path = require('node:path');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const batch = path.resolve(process.argv[2]);
const ports = {
  zh: Number(process.env.TASK8_PREVIEW_ZH_PORT || 5187),
  en: Number(process.env.TASK8_PREVIEW_EN_PORT || 5188),
};
for (const locale of ['zh', 'en']) {
  const port = ports[locale];
  const root = path.join(batch, `${locale}-package`);
  assert(existsSync(path.join(root, 'experiment', 'index.html')) && !existsSync(path.join(root, '.git')), 'Preview requires an independent built package');
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let file;
    try { file = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)}`); }
    catch { response.writeHead(400); response.end(); return; }
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
  });
  server.listen(port, '127.0.0.1', () => console.log(`${locale}: http://127.0.0.1:${port}/?debug=1 (${root})`));
}
