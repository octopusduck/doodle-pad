import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://doodle.test';
const SOURCE = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

/** Run service-worker.js against an in-memory Cache Storage and a fake network. */
function loadWorker(network, origin = ORIGIN) {
  const store = new Map();
  const listeners = {};
  const requests = [];
  const key = request => new URL(typeof request === 'string' ? request : request.url, `${origin}/`).href.split('?')[0];
  const cache = { put: async (request, response) => { store.set(key(request), response); } };
  vm.runInNewContext(SOURCE, {
    self: {
      location: new URL(`${origin}/`),
      addEventListener: (name, listener) => { listeners[name] = listener; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} }
    },
    caches: { open: async () => cache, match: async request => store.get(key(request)), keys: async () => [], delete: async () => true },
    fetch: async request => { requests.push(request); return network(request); },
    Request, Response, URL
  });
  async function dispatch(name, props = {}) {
    const pending = [];
    let response;
    listeners[name]({ ...props, waitUntil: promise => pending.push(promise), respondWith: promise => { response = promise; } });
    const result = await response;
    for (let i = 0; i < pending.length; i++) await pending[i];
    return result;
  }
  return { store, requests, dispatch };
}

const get = (url, mode = 'cors') => ({ request: { url: `${ORIGIN}${url}`, method: 'GET', mode } });

test('local preview refreshes use the latest files and still fall back offline', async () => {
  const origin = 'http://localhost:8001';
  let version = 'cached';
  let offline = false;
  const sw = loadWorker(request => {
    if (offline) throw new TypeError('offline');
    return new Response(`${version}:${request.url}`);
  }, origin);
  await sw.dispatch('install');
  version = 'edited';
  const request = new Request(`${origin}/brushes.js`);
  const fresh = await sw.dispatch('fetch', { request });
  assert.equal(await fresh.text(), `edited:${request.url}`);
  assert.equal(sw.requests.at(-1).cache, 'no-store');
  offline = true;
  const cached = await sw.dispatch('fetch', { request });
  assert.equal(await cached.text(), `cached:${request.url}`);
});

test('install downloads every shell file fresh, bypassing the HTTP cache', async () => {
  const sw = loadWorker(request => new Response(`v1:${request.url}`));
  await sw.dispatch('install');
  assert(sw.requests.length >= 8);
  assert(sw.requests.every(request => request.cache === 'reload'));
  assert.equal(await sw.store.get(`${ORIGIN}/app.js`).text(), `v1:${ORIGIN}/app.js`);
});

test('files missing from the offline cache come from the network and are kept for offline use', async () => {
  let online = true;
  const sw = loadWorker(request => {
    if (!online) throw new TypeError('offline');
    return new Response(`net:${request.url}`);
  });
  await sw.dispatch('install');
  const response = await sw.dispatch('fetch', get('/new-module.js'));
  assert.equal(await response.text(), `net:${ORIGIN}/new-module.js`);

  online = false;
  const offline = await sw.dispatch('fetch', get('/new-module.js'));
  assert.equal(await offline.text(), `net:${ORIGIN}/new-module.js`, 'served from the cache while offline');
  const deepLink = await sw.dispatch('fetch', get('/some/deep/link', 'navigate'));
  assert.equal(await deepLink.text(), `net:${ORIGIN}/index.html`, 'offline navigations get the app shell');
  const missing = await sw.dispatch('fetch', get('/never-seen.png'));
  assert.equal(missing.type, 'error');
});

test('a refresh replaces the shell only when every file downloads', async () => {
  let version = 'v1';
  let failing = null;
  const sw = loadWorker(request => request.url === failing
    ? new Response('', { status: 500 })
    : new Response(`${version}:${request.url}`));
  await sw.dispatch('install');

  version = 'v2';
  failing = `${ORIGIN}/brushes.js`;
  await sw.dispatch('message', { data: 'refresh-shell' });
  assert.equal(await sw.store.get(`${ORIGIN}/app.js`).clone().text(), `v1:${ORIGIN}/app.js`, 'a partial update changes nothing');

  failing = null;
  await sw.dispatch('message', { data: 'refresh-shell' });
  assert.equal(await sw.store.get(`${ORIGIN}/app.js`).text(), `v2:${ORIGIN}/app.js`);
  assert.equal(await sw.store.get(`${ORIGIN}/brushes.js`).text(), `v2:${ORIGIN}/brushes.js`);
  assert.equal(sw.requests.at(-1).cache, 'no-cache', 'refreshes revalidate instead of re-downloading');
});
