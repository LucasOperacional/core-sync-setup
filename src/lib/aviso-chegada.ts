/** Avisos no celular quando o supervisor chega a um posto. */

/** Pede a permissão de aviso no celular (uma vez por aparelho). */
export async function pedirPermissaoAviso(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    /* sem aviso no celular */
  }
}

/** Mostra o aviso no celular; funciona também com o app em segundo plano. */
export async function avisarNoCelular(titulo: string, texto: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const opcoes: NotificationOptions = { body: texto, tag: "chegada-posto" };
  try {
    if ("serviceWorker" in navigator) {
      const registro = await navigator.serviceWorker.ready;
      await registro.showNotification(titulo, opcoes);
      return;
    }
  } catch {
    /* cai para o aviso simples */
  }
  try {
    new Notification(titulo, opcoes);
  } catch {
    /* navegador sem suporte */
  }
}
