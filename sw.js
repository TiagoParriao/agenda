// Service worker: guarda os arquivos do site para ele abrir mesmo sem internet.
// Os dados (agenda) não passam por aqui: quem cuida deles offline é o cache do próprio Firestore.
//
// Arquivos do site: "rede primeiro" (sempre pega a versão nova quando há internet; sem internet usa a guardada).
// Biblioteca do Firebase (gstatic, versão fixa): "guardado primeiro" (nunca muda).

const VERSAO = "agenda-v1";

const ARQUIVOS = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "js/auth.js",
  "js/firebase.js",
  "js/firebase-config.js",
  "js/util.js",
  "js/store.js",
  "js/agenda.js",
  "js/feriados.js",
  "js/whatsapp.js",
  "js/admin.js",
  "js/ui-modal.js",
  "js/ui-abas.js",
  "js/ui-dia.js",
  "js/ui-mes.js",
  "js/ui-busca.js",
  "js/ui-config.js",
  "icons/icone.svg",
  "icons/icone-192.png",
  "icons/favicon-32.png",
  "icons/apple-touch-icon.png",
];

const SDK = ["app", "auth", "firestore"].map(
  (m) => `https://www.gstatic.com/firebasejs/12.19.0/firebase-${m}.js`
);

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    await cache.addAll(ARQUIVOS);
    // O SDK é guardado "se der": não impede a instalação se o CDN falhar.
    await Promise.allSettled(SDK.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome !== VERSAO) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    evento.respondWith(redePrimeiro(req));
  } else if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    evento.respondWith(guardadoPrimeiro(req));
  }
  // Todo o resto (Firestore, login, wa.me...) segue direto, sem passar pelo cache.
});

async function redePrimeiro(req) {
  const cache = await caches.open(VERSAO);
  try {
    const resposta = await fetch(req, { cache: "no-cache" });
    if (resposta.ok) cache.put(req, resposta.clone());
    return resposta;
  } catch {
    const guardada = await cache.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
    return Response.error();
  }
}

async function guardadoPrimeiro(req) {
  const cache = await caches.open(VERSAO);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const resposta = await fetch(req);
  if (resposta.ok) cache.put(req, resposta.clone());
  return resposta;
}
