// Semana 2 - Arquitectura PWA Offline
const NOMBRE_CACHE = 'pwa-cache-snoopy-v32';
const RECURSOS_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './CSS/styles.css',
    './JS/script.js',
    './data/catalogo.json'
];

self.addEventListener('install', (eventoInstalacion) => {
    eventoInstalacion.waitUntil(
        caches.open(NOMBRE_CACHE).then((almacenCache) => almacenCache.addAll(RECURSOS_CACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (eventoActivacion) => {
    eventoActivacion.waitUntil(
        caches.keys().then((claves) => Promise.all(claves.map((c) => (c !== NOMBRE_CACHE ? caches.delete(c) : null)))).then(() => self.clients.claim())
    );
});

// Semana 2 - Estrategia Cache Dinamico Offline (App Shell + Imagenes Dropbox)
self.addEventListener('fetch', (eventoPeticion) => {
    const peticion = eventoPeticion.request;
    const urlPeticion = peticion.url || '';
    if (peticion.method !== 'GET' || urlPeticion.includes('supabase.co')) return;

    const esImagenDropbox =
        urlPeticion.includes('dropbox.com') ||
        urlPeticion.includes('dropboxusercontent.com');

    if (esImagenDropbox) {
        eventoPeticion.respondWith(
            caches.match(peticion).then((respuestaCache) => {
                if (respuestaCache) return respuestaCache;
                return fetch(peticion)
                    .then((respuestaRed) => {
                        if (respuestaRed && (respuestaRed.status === 200 || respuestaRed.type === 'opaque')) {
                            const copia = respuestaRed.clone();
                            caches.open(NOMBRE_CACHE).then((cache) => cache.put(peticion, copia));
                        }
                        return respuestaRed;
                    })
                    .catch(() => respuestaCache || Response.error());
            })
        );
        return;
    }

    if (urlPeticion.includes('data/catalogo.json')) {
        eventoPeticion.respondWith(
            fetch(peticion)
                .then((respuestaRed) => {
                    if (respuestaRed && respuestaRed.status === 200) {
                        const copia = respuestaRed.clone();
                        caches.open(NOMBRE_CACHE).then((cache) => cache.put(peticion, copia));
                    }
                    return respuestaRed;
                })
                .catch(() => caches.match(peticion))
        );
        return;
    }

    eventoPeticion.respondWith(
        caches.match(peticion).then((respuestaCache) => {
            if (respuestaCache) return respuestaCache;
            return fetch(peticion)
                .then((respuestaRed) => {
                    if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
                        const copia = respuestaRed.clone();
                        caches.open(NOMBRE_CACHE).then((cache) => cache.put(peticion, copia));
                    }
                    return respuestaRed;
                })
                .catch(() => {
                    if (peticion.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return null;
                });
        })
    );
});
