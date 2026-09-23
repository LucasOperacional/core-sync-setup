/* Service worker das notificações no celular (Web Push nativo + VAPID).
 * Não usa Firebase, FCM nem nenhum SDK externo.
 * Arquivo separado do gps-sw.js para não interferir no rastreio.
 */

self.addEventListener("install", (evento) => {
  evento.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

/** Lê o conteúdo do aviso com proteção contra formato inválido. */
function lerPayload(evento) {
  try {
    if (!evento.data) return null;
    const dados = evento.data.json();
    if (!dados || typeof dados !== "object") return null;
    return dados;
  } catch {
    try {
      const texto = evento.data ? evento.data.text() : "";
      return texto ? { title: "Aviso", body: String(texto).slice(0, 150) } : null;
    } catch {
      return null;
    }
  }
}

/** Só aceita caminhos internos do próprio domínio. */
function rotaSegura(valor) {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//")) return "/";
  return valor;
}

self.addEventListener("push", (evento) => {
  const dados = lerPayload(evento) ?? {};
  const titulo = typeof dados.title === "string" && dados.title ? dados.title : "Novo aviso";
  const corpo = typeof dados.body === "string" ? dados.body : "";
  const tag = typeof dados.tag === "string" && dados.tag ? dados.tag : "ciop-aviso";

  const opcoes = {
    body: corpo,
    tag,
    renotify: false,
    requireInteraction: dados.priority === "high",
    data: {
      target_url: rotaSegura(dados.target_url),
      notification_id: typeof dados.notification_id === "string" ? dados.notification_id : null,
      category: typeof dados.category === "string" ? dados.category : null,
      event: typeof dados.event === "string" ? dados.event : null,
    },
  };

  if (typeof dados.icon === "string" && dados.icon.startsWith("/")) opcoes.icon = dados.icon;
  if (typeof dados.badge === "string" && dados.badge.startsWith("/")) opcoes.badge = dados.badge;

  evento.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = rotaSegura(evento.notification.data && evento.notification.data.target_url);

  evento.waitUntil(
    (async () => {
      const alvo = new URL(destino, self.location.origin);
      if (alvo.origin !== self.location.origin) return;

      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const janela of janelas) {
        try {
          if (new URL(janela.url).origin !== self.location.origin) continue;
          if ("navigate" in janela) await janela.navigate(alvo.href);
          await janela.focus();
          return;
        } catch {
          /* tenta a próxima janela */
        }
      }
      await self.clients.openWindow(alvo.href);
    })(),
  );
});
