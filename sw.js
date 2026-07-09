/* sw.js — オフライン対応の Service Worker
 * アプリ本体とデータJSONを事前キャッシュし、通信なしでも
 * 単語帳の閲覧・復習・問題演習・分析ができるようにする。
 * (Anthropic APIへの通信はキャッシュせず常にネットワークへ)
 */
const CACHE = 'fe-app-v13';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/data.js',
  './js/ai.js',
  './js/charts.js',
  './js/app.js',
  './manifest.webmanifest',
  './qualifications/fe/words.json',
  './qualifications/fe/questions.json',
  './qualifications/fe/questions_official.json',
  './qualifications/fe/questions_generated.json',
  './qualifications/fe/questions_calc.json',
  './qualifications/fe/questions_b.json',
  './qualifications/fe/questions_b_generated.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API呼び出しなど外部通信はそのままネットワークへ
  if (url.origin !== self.location.origin) return;
  // 同一オリジンは cache-first、無ければネットワーク取得して追記
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
