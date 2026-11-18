import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('service worker caches repository-scoped assets and only removes its own obsolete cache', async () => {
  const scope = 'https://example.test/calories/';
  const handlers = {}, stored = new Map(), deleted = [];
  let claimed = false, cachedAssets;
  const context = {
    URL, Request,
    self: { registration: { scope }, clients: { claim: async () => { claimed = true; } }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: {
      open: async name => {
        if (!stored.has(name)) stored.set(name, new Map());
        return {
          addAll: async requests => { cachedAssets = requests; for (const request of requests) stored.get(name).set(request.url, `cached:${request.url}`); },
          match: async request => stored.get(name).get(request.url),
        };
      },
      keys: async () => [...stored.keys(), 'light-balance:/calories/:old', 'light-balance:/another-repo/:old', 'other-app'],
      delete: async name => { deleted.push(name); },
    },
    fetch: async () => { throw new Error('offline'); },
  };
  vm.runInNewContext(source, context);
  let pending;
  handlers.install({ waitUntil: p => { pending = p; } }); await pending;
  assert.ok(cachedAssets.some(request => request.url === `${scope}data/foods.json`));
  assert.ok(cachedAssets.some(request => request.url === `${scope}core.js`));
  assert.ok(cachedAssets.every(request => request.cache === 'reload'));
  handlers.activate({ waitUntil: p => { pending = p; } }); await pending;
  assert.equal(claimed, true);
  assert.deepEqual(deleted, ['light-balance:/calories/:old']);
  handlers.fetch({ request: { method: 'GET', url: `${scope}data/foods.json` }, respondWith: p => { pending = p; } });
  assert.equal(await pending, `cached:${scope}data/foods.json`);
  let intercepted = false;
  handlers.fetch({ request: { method: 'POST', url: scope }, respondWith: () => { intercepted = true; } });
  handlers.fetch({ request: { method: 'GET', url: 'https://other.test/api' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});

test('manifest uses relative paths and real install icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  for (const icon of manifest.icons.filter(icon => icon.type === 'image/png')) {
    const data = await readFile(new URL('../' + icon.src, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size);
  }
});
