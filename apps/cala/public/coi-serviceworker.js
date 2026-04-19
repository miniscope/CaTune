/*! coi-serviceworker v0.1.7 — https://github.com/gzuidhof/coi-serviceworker
 * MIT License. Inlined here so GitHub Pages can serve the CaLa app
 * with the COOP/COEP headers `SharedArrayBuffer` requires (design
 * §13). On Pages we can't set HTTP headers server-side; the service
 * worker intercepts top-level navigations and re-issues them with the
 * headers attached, then the browser refreshes and we get
 * `crossOriginIsolated` = true.
 *
 * Vite dev and `vite preview` set the same headers directly (see
 * `vite.config.ts`), so this script is a no-op there.
 */
/* eslint-disable */
/* prettier-ignore */
(() => {
  if (typeof window === 'undefined') {
    // Service worker scope.
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
    self.addEventListener('message', (ev) => {
      if (!ev.data) return;
      if (ev.data.type === 'deregister') {
        self.registration
          .unregister()
          .then(() => self.clients.matchAll())
          .then((clients) => {
            clients.forEach((client) => client.navigate(client.url));
          });
      }
    });
    self.addEventListener('fetch', (event) => {
      const r = event.request;
      if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
      const request = r.cache === 'no-cache' ? new Request(r, { cache: 'no-store' }) : r;
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.status === 0) return response;
            const newHeaders = new Headers(response.headers);
            newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
            newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            });
          })
          .catch((e) => console.error(e)),
      );
    });
  } else {
    // Page scope.
    const coi = {
      shouldRegister: () => !window.crossOriginIsolated,
      shouldDeregister: () => false,
      coepCredentialless: () => false,
      doReload: () => window.location.reload(),
      quiet: false,
      ...(window.coi ?? {}),
    };
    const n = navigator;
    if (n.serviceWorker && n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({ type: coi.shouldDeregister() ? 'deregister' : 'noop' });
    }
    if (!window.crossOriginIsolated && !coi.shouldDeregister() && coi.shouldRegister()) {
      if (!n.serviceWorker) {
        if (!coi.quiet) console.warn('COOP/COEP Service Worker unavailable; no cross-origin isolation.');
        return;
      }
      n.serviceWorker
        .register(window.document.currentScript.src)
        .then((registration) => {
          if (!coi.quiet) console.log('COOP/COEP service worker registered.', registration.scope);
          registration.addEventListener('updatefound', () => {
            if (!coi.quiet) console.log('Reloading page to make use of updated COOP/COEP service worker.');
            coi.doReload();
          });
          if (registration.active && !n.serviceWorker.controller) {
            if (!coi.quiet) console.log('Reloading page to make use of COOP/COEP service worker.');
            coi.doReload();
          }
        })
        .catch((err) => {
          if (!coi.quiet) console.error('COOP/COEP service worker failed to register:', err);
        });
    }
  }
})();
