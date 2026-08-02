const CACHE_VERSION = "orbit-offline-v1";
const APP_CACHE = `${CACHE_VERSION}-app`;
const PRIVATE_CACHE = `${CACHE_VERSION}-private`;
const STATIC_PATHS = ["/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(STATIC_PATHS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("orbit-offline-") && key !== APP_CACHE && key !== PRIVATE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_CACHE") {
    event.waitUntil(caches.delete(PRIVATE_CACHE));
    return;
  }

  if (event.data?.type === "CACHE_APP_SHELL" && Array.isArray(event.data.routes)) {
    const routes = event.data.routes.filter((route) => typeof route === "string" && route.startsWith("/"));
    event.waitUntil(
      caches.open(APP_CACHE).then(async (cache) => {
        await Promise.allSettled(routes.map(async (route) => {
          const response = await fetch(route, { credentials: "include", cache: "no-store" });
          if (response.ok) await cache.put(route, response);
        }));
      }),
    );
  }
});

async function offlineResponse(cached) {
  const headers = new Headers(cached.headers);
  headers.set("X-Orbit-Offline", "true");
  return new Response(await cached.blob(), {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}

async function networkFirst(request, cacheName, markOffline = false) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (!cached) throw error;
    return markOffline ? offlineResponse(cached) : cached;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/auth/session" || url.pathname === "/api/workspace") {
    event.respondWith(networkFirst(request, PRIVATE_CACHE, true));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, APP_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/favicon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request));
  }
});
