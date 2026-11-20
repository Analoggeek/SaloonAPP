const cacheName = "maison-noir-shell-v1";
const offline = "/offline.html";
self.addEventListener("install", (event) => {
  // Cache only an offline notice. Booking responses, admin pages, and customer data remain network-only.
  event.waitUntil(caches.open(cacheName).then((cache) => cache.add(offline)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("maison-noir-shell-") && key !== cacheName,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    !["/", "/install.html", "/booking"].includes(url.pathname)
  )
    return;
  event.respondWith(
    fetch(request).catch(async () => {
      return (
        (await (await caches.open(cacheName)).match(offline)) ||
        Response.error()
      );
    }),
  );
});
