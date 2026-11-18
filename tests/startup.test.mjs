import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

test('slow food loading preserves unsaved body inputs', async () => {
  const window = new Window({ url: 'http://localhost:4188/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true } });
  const document = window.document;
  document.write(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries({ window, document, location: window.location, navigator: window.navigator, localStorage: window.localStorage, FormData: window.FormData })) Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  let fetchStarted, resolveFetch;
  const started = new Promise(resolve => { fetchStarted = resolve; });
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve; fetchStarted(); });
  const importing = import('../app.js');
  await started;
  window.location.hash = 'settings';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  document.querySelector('[name="age"]').value = '31';
  document.querySelector('[name="height"]').value = '176';
  resolveFetch(new Response('[]'));
  await importing;
  assert.equal(document.querySelector('[name="age"]').value, '31');
  assert.equal(document.querySelector('[name="height"]').value, '176');
  await window.happyDOM.abort();
});
