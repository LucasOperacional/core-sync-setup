/** Registro do celular para receber notificações (Web Push nativo + VAPID).
 * Sem Firebase, sem FCM. A chave privada VAPID nunca aparece aqui.
 */

import { supabase } from "@/integrations/supabase/client";

export type EstadoPush =
  "ativado" | "nao-ativado" | "bloqueado" | "incompativel" | "https-necessario" | "sem-chave";

const CAMINHO_SW = "/push-sw.js";

function chavePublica(): string {
  return (import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined)?.trim() ?? "";
}

/** O navegador tem tudo o que é preciso para o Web Push? */
export function supportsWebPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function contextoSeguro(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext || window.location.hostname === "localhost";
}

/** Aparelho Apple: só recebe avisos depois de adicionar à Tela de Início. */
export function ehIosSemInstalar(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const apple =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!apple) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone;
}

function b64UrlParaUint8(valor: string): Uint8Array {
  const limpo = valor.replace(/-/g, "+").replace(/_/g, "/");
  const pad = limpo + "=".repeat((4 - (limpo.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Situação atual das notificações neste aparelho. */
export async function getPushStatus(): Promise<EstadoPush> {
  if (typeof window === "undefined") return "nao-ativado";
  if (!contextoSeguro()) return "https-necessario";
  if (!supportsWebPush()) return "incompativel";
  if (!chavePublica()) return "sem-chave";
  if (Notification.permission === "denied") return "bloqueado";
  try {
    const registro = await navigator.serviceWorker.getRegistration(CAMINHO_SW);
    const assinatura = await registro?.pushManager.getSubscription();
    if (!assinatura) return "nao-ativado";
    const { data } = await supabase
      .from("push_subscriptions")
      .select("enabled")
      .eq("endpoint", assinatura.endpoint)
      .maybeSingle();
    return data?.enabled ? "ativado" : "nao-ativado";
  } catch {
    return "nao-ativado";
  }
}

function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iPhone/iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Computador Windows";
  if (/Macintosh/.test(ua)) return "Mac";
  return "Navegador";
}

/** Liga as notificações neste aparelho. Chame só a partir de um clique do usuário. */
export async function enablePushNotifications(): Promise<{ ok: boolean; erro?: string }> {
  if (!contextoSeguro()) return { ok: false, erro: "É necessário acessar o sistema por HTTPS." };
  if (!supportsWebPush()) return { ok: false, erro: "Este navegador não aceita notificações." };
  const chave = chavePublica();
  if (!chave) {
    return {
      ok: false,
      erro: "A chave pública de notificações (VITE_VAPID_PUBLIC_KEY) ainda não foi configurada.",
    };
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    return {
      ok: false,
      erro:
        permissao === "denied"
          ? "As notificações estão bloqueadas nas configurações do navegador."
          : "Permissão não concedida.",
    };
  }

  await navigator.serviceWorker.register(CAMINHO_SW, { scope: "/" });
  await navigator.serviceWorker.ready;
  const registro = (await navigator.serviceWorker.getRegistration(CAMINHO_SW))!;

  let assinatura = await registro.pushManager.getSubscription();
  let nova = false;
  if (!assinatura) {
    assinatura = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64UrlParaUint8(chave) as unknown as BufferSource,
    });
    nova = true;
  }

  const json = assinatura.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!p256dh || !auth) {
    if (nova) await assinatura.unsubscribe();
    return { ok: false, erro: "O navegador não forneceu as chaves de entrega." };
  }

  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao.session?.user.id;
  if (!userId) {
    if (nova) await assinatura.unsubscribe();
    return { ok: false, erro: "Sessão expirada: entre novamente." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: assinatura.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 300),
      device_name: nomeDoAparelho(),
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    if (nova) await assinatura.unsubscribe();
    return { ok: false, erro: "Não foi possível salvar este aparelho. Tente novamente." };
  }

  return { ok: true };
}

/** Desliga as notificações neste aparelho. */
export async function disablePushNotifications(): Promise<{ ok: boolean; erro?: string }> {
  try {
    const registro = await navigator.serviceWorker.getRegistration(CAMINHO_SW);
    const assinatura = await registro?.pushManager.getSubscription();
    if (assinatura) {
      await supabase
        .from("push_subscriptions")
        .update({ enabled: false })
        .eq("endpoint", assinatura.endpoint);
      await assinatura.unsubscribe();
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível desativar agora. Tente novamente." };
  }
}

/** Envia uma notificação de teste para a própria pessoa. */
export async function sendTestPush(): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { enviarNotificacaoPush } = await import("./push.functions");
    const r = await enviarNotificacaoPush({
      data: {
        category: "sistema",
        event: "notificacao_teste",
        context: { descricao: "Teste de notificação solicitado pela própria pessoa." },
        targetUrl: "/notificacoes",
      },
    });
    const primeiro = r.resultados[0];
    if (!r.ok) {
      return {
        ok: false,
        erro:
          primeiro?.motivo ??
          "Não foi possível entregar o teste. Confira se as notificações estão ativadas neste aparelho.",
      };
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha no envio de teste." };
  }
}
