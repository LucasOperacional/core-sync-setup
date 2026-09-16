/* Service worker do rastreio GPS.
 * Mantém o envio da posição do supervisor mesmo com o site/PWA fechado ou em
 * segundo plano: a página envia a última posição e o token, e este worker
 * reenvia periodicamente (Periodic Background Sync) ou quando a rede volta.
 */

const CACHE = "gps-estado-v1";
const CHAVE = "/__gps_estado";
const ENDPOINT = "/api/public/rastreio-ping";

async function salvarEstado(estado) {
  const cache = await caches.open(CACHE);
  await cache.put(
    CHAVE,
    new Response(JSON.stringify(estado), { headers: { "content-type": "application/json" } }),
  );
}

async function lerEstado() {
  const cache = await caches.open(CACHE);
  const resposta = await cache.match(CHAVE);
  if (!resposta) return null;
  try {
    return await resposta.json();
  } catch {
    return null;
  }
}

async function enviarUltima() {
  const estado = await lerEstado();
  if (!estado || !estado.token || typeof estado.latitude !== "number") return;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...estado, capturadoEm: new Date().toISOString() }),
    });
  } catch {
    /* sem rede: tenta de novo no próximo evento */
  }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("message", (evento) => {
  const dados = evento.data;
  if (!dados || dados.tipo !== "gps-posicao") return;
  evento.waitUntil(
    (async () => {
      await salvarEstado(dados.estado);
      await enviarUltima();
    })(),
  );
});

self.addEventListener("periodicsync", (evento) => {
  if (evento.tag === "gps-ping") evento.waitUntil(enviarUltima());
});

self.addEventListener("sync", (evento) => {
  if (evento.tag === "gps-ping") evento.waitUntil(enviarUltima());
});
