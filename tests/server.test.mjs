import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../scripts/serve.mjs';
import { assets } from '../scripts/assets.mjs';

test('static server supports GitHub repository subpaths and excludes private development files', async () => {
  const server = createServer('/my-calories/');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const asset of assets) {
      const response = await fetch(`${base}/my-calories/${asset}`);
      assert.equal(response.status, 200, asset);
      assert.ok(Number(response.headers.get('content-length')) > 0, asset);
    }
    assert.equal((await fetch(`${base}/my-calories/`)).status, 200);
    assert.match((await fetch(`${base}/my-calories/app.js`)).headers.get('content-type'), /javascript/);
    for (const path of ['.tools/node.exe', 'package.json', '.git/config', '%2e%2e%2fpackage.json']) {
      assert.equal((await fetch(`${base}/my-calories/${path}`)).status, 404);
    }
    assert.equal((await fetch(`${base}/index.html`)).status, 404);
    assert.equal((await fetch(`${base}/my-calories/index.html`, { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
