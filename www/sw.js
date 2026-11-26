/* ProCut Studio — Service Worker (Phase 1)
   Kaam: app shell (index, manifest, icons) ko cache karke editor ko
   offline bhi khulne ke qabil banana, aur bahari cheezein (lamejs CDN,
   Google Fonts) runtime cache mein rakhna taake dobara visit par
   net ki zaroorat kam ho.
   Policy:
   - Navigation / index.html: network pehle (naya version foran mile),
     net na ho to cache se purana shell.
   - Apni doosri files (icons, manifest): cache pehle, peeche net se taza.
   - CDN + Fonts: stale-while-revalidate (cache se foran, peeche update).
   Har cheez ehtiyaat se — koi request fail ho to page ka asal
   network rasta hi istemal hota hai. */
var SHELL_CACHE = "procut-shell-v2";
var RUNTIME_CACHE = "procut-runtime-v2";
var SHELL_FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", function (ev) {
  ev.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      /* addAll ki bajaye aik aik karke — koi aik file na mile to
         baqi cache ho jayein aur install fail na ho. */
      return Promise.all(SHELL_FILES.map(function (u) {
        return cache.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
        return Promise.resolve();
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  /* Bahari CDN / fonts — stale-while-revalidate */
  var isRuntimeHost = (url.hostname === "cdn.jsdelivr.net" ||
                       url.hostname === "fonts.googleapis.com" ||
                       url.hostname === "fonts.gstatic.com");
  if (isRuntimeHost) {
    ev.respondWith(
      caches.open(RUNTIME_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            try { if (res && (res.status === 200 || res.type === "opaque")) cache.put(req, res.clone()); } catch (e) {}
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* Navigation / index.html — network pehle, offline par cache */
  var isShellDoc = (req.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/"));
  if (isShellDoc) {
    /* Cache-bypass fetch: naya number wala URL + no-store — browser ki
       HTTP cache se purani index.html kabhi wapas nahi aayegi. */
    var netFetch;
    try {
      var fu = new URL(req.url); fu.searchParams.set("__sw", "2");
      netFetch = fetch(fu.toString(), { cache: "no-store" });
    } catch (e) { netFetch = fetch(req); }
    ev.respondWith(
      netFetch.then(function (res) {
        try {
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function (cache) { cache.put("./index.html", copy); }).catch(function () {});
        } catch (e) {}
        return res;
      }).catch(function () {
        return caches.match("./index.html").then(function (m) {
          return m || new Response("Offline — editor ka cache maujood nahi. Internet se dobara kholein.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        });
      })
    );
    return;
  }

  /* Apni baqi files (icons, manifest waghera) — cache pehle */
  ev.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        try {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(SHELL_CACHE).then(function (cache) { cache.put(req, copy); }).catch(function () {});
          }
        } catch (e) {}
        return res;
      });
    })
  );
});
