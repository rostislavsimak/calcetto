// Minimal cache-first service worker for the calcetto app shell.
// Local shell is precached at install; everything else (CDN scripts,
// fonts) is runtime-cached on first successful fetch, so after one
// online visit the app opens fully offline.
const CACHE = "calcetto-v1";
const SHELL = [
  "./",
  "calcetto-squadre.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // add one by one: a single 404 (e.g. "./" on some hosts) must not
      // fail the whole install
      Promise.allSettled(SHELL.map((u) => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          // runtime-cache successful responses; opaque cross-origin
          // responses (CDN, fonts) are cacheable too
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(e.request, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() =>
          // offline and not cached: for navigations fall back to the
          // app shell instead of the browser error page
          e.request.mode === "navigate"
            ? caches.match("calcetto-squadre.html")
            : Promise.reject(new Error("offline"))
        );
    })
  );
});
