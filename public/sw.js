// Service worker do Espaço Persona.
// Não guarda dados de clientes no aparelho: as páginas sempre vêm da internet.
// Sem conexão, mostra a página /offline.html.

const CACHE = "persona-v1";
const ESSENCIAIS = ["/offline.html", "/icones/icone-192.png", "/icones/simbolo.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.mode !== "navigate") return; // só trata a abertura de páginas
  evento.respondWith(fetch(evento.request).catch(() => caches.match("/offline.html")));
});
