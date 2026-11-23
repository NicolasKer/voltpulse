import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'voltpulse-sw-generator',
      apply: 'build',
      closeBundle() {
        const distDir = path.resolve(process.cwd(), 'dist');
        if (!fs.existsSync(distDir)) return;

        const collectFiles = (dir: string, relBase = ''): string[] => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const results: string[] = [];
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'sw.js') continue;
            const full = path.join(dir, entry.name);
            const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              results.push(...collectFiles(full, rel));
            } else {
              results.push(`./${rel}`);
            }
          }
          return results;
        };

        const staticFiles = collectFiles(distDir);
        const precacheUrls = Array.from(new Set(['./', ...staticFiles]));
        const hash = crypto
          .createHash('sha1')
          .update(precacheUrls.join('|') + ':' + Date.now())
          .digest('hex')
          .slice(0, 10);

        const swSource = `// Auto-generated offline Service Worker for VoltPulse PWA
const CACHE_NAME = 'voltpulse-cache-${hash}';
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('voltpulse-cache-') && key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ignore cross-origin requests (ODRÉ IRVE API, IGN geocoder, Carto map tiles)
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
`;
        fs.writeFileSync(path.join(distDir, 'sw.js'), swSource, 'utf8');
      },
    },
  ],
});
