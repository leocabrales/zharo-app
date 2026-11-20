/* Service worker mínimo para poder instalar la PWA. No cachea datos en vivo. */
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
