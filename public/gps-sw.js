/* Service worker do rastreio GPS.
 * Mantém o envio da posição do supervisor mesmo com o site/PWA fechado ou em
 * segundo plano: a página envia a última posição e o token, e este worker
 * reenvia periodicamente (timer próprio, Periodic Background Sync ou quando a
 * rede volta). Se o token expirar, ele é renovado sozinho pelo refresh token.
 */

const CACHE = "gps-estado-v1";
const CHAVE = "/__gps_estado";
const ENDPOINT = "/api/public/rastreio-ping";
/* Batimento próprio do worker: enquanto ele estiver vivo, o sinal continua. */
const INTERVALO_MS = 60_000;

let relogio = null;

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

/** Renova o token do supervisor quando ele expira (app fechado por horas). */
async function renovarToken(estado) {
  if (!estado.refreshToken || !estado.supabaseUrl || !estado.apiKey) return null;
  try {
    const resposta = await fetch(
      `${estado.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: { "content-type": "application/json", apikey: estado.apiKey },
        body: JSON.stringify({ refresh_token: estado.refreshToken }),
      },
    );
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    if (!dados || !dados.access_token) return null;
    const novo = {
      ...estado,
      token: dados.access_token,
      refreshToken: dados.refresh_token || estado.refreshToken,
    };
    await salvarEstado(novo);
    return novo;
  } catch {
    return null;
  }
}

async function postar(estado) {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...estado, capturadoEm: new Date().toISOString() }),
  });
}

async function enviarUltima() {
  let estado = await lerEstado();
  if (!estado || !estado.token || typeof estado.latitude !== "number") return;
  try {
    let resposta = await postar(estado);
    if (resposta.status === 401) {
      const renovado = await renovarToken(estado);
      if (renovado) {
        estado = renovado;
        resposta = await postar(estado);
      }
    }
  } catch {
    /* sem rede: tenta de novo no próximo evento */
  }
}

function ligarBatimento() {
  if (relogio !== null) return;
  relogio = setInterval(() => {
    enviarUltima();
  }, INTERVALO_MS);
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      await self.clients.claim();
      ligarBatimento();
    })(),
  );
});

self.addEventListener("message", (evento) => {
  const dados = evento.data;
  if (!dados || dados.tipo !== "gps-posicao") return;
  evento.waitUntil(
    (async () => {
      const anterior = (await lerEstado()) || {};
      await salvarEstado({ ...anterior, ...dados.estado });
      ligarBatimento();
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

/* Qualquer despertar do worker (push, navegação) reaproveita para enviar. */
self.addEventListener("push", (evento) => {
  evento.waitUntil(enviarUltima());
});
