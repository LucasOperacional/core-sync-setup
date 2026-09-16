/**
 * Captura de erros técnicos do navegador para o monitoramento central.
 *
 * Todo envio passa pelo backend (/api/public/monitor-error) — o navegador
 * nunca conhece a URL nem a chave do painel central. Somente mensagem técnica,
 * rota e status HTTP são enviados; nenhum dado pessoal, documento, nome,
 * senha ou token sai daqui.
 */

import { sanitizeText, sanitizeUrl } from "./privacy/redaction";

type TipoErro =
  "javascript" | "onerror" | "unhandledrejection" | "http" | "supabase" | "network" | "timeout";

const ENDPOINT = "/api/public/monitor-error";
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 10;

let enviados: number[] = [];
const vistosRecentes = new Map<string, number>();
let instalado = false;

function podeEnviar(chave: string): boolean {
  const agora = Date.now();
  enviados = enviados.filter((t) => agora - t < JANELA_MS);
  if (enviados.length >= MAX_POR_JANELA) return false;

  const visto = vistosRecentes.get(chave);
  if (visto && agora - visto < 30_000) return false;
  vistosRecentes.set(chave, agora);
  if (vistosRecentes.size > 50) vistosRecentes.clear();

  enviados.push(agora);
  return true;
}

/** Envia um erro técnico sanitizado ao backend (silencioso em caso de falha). */
export function reportarErroMonitor(input: {
  tipo: TipoErro;
  mensagem: unknown;
  statusHttp?: number | null;
  origem?: string;
}): void {
  if (typeof window === "undefined") return;
  const mensagem = sanitizeText(input.mensagem, 400);
  if (!mensagem.trim()) return;
  const chave = `${input.tipo}:${mensagem}:${input.statusHttp ?? ""}`;
  if (!podeEnviar(chave)) return;

  const corpo = JSON.stringify({
    tipo: input.tipo,
    mensagem,
    rota: sanitizeUrl(window.location.pathname),
    statusHttp: input.statusHttp ?? null,
    origem: input.origem ?? "browser",
  });

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* monitoramento nunca quebra a aplicação */
  }
}

/** Instala a captura automática de erros do navegador. */
export function instalarCapturaErros(): void {
  if (typeof window === "undefined" || instalado) return;
  instalado = true;

  window.addEventListener("error", (event) => {
    reportarErroMonitor({
      tipo: "onerror",
      mensagem:
        event.error instanceof Error
          ? `${event.error.name}: ${event.error.message}`
          : event.message,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const motivo = event.reason;
    reportarErroMonitor({
      tipo: "unhandledrejection",
      mensagem:
        motivo instanceof Error ? `${motivo.name}: ${motivo.message}` : String(motivo ?? ""),
    });
  });

  // Falhas de rede e respostas HTTP 4xx/5xx (inclui chamadas ao backend).
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const ehProprioMonitor = url.includes(ENDPOINT);
    try {
      const res = await fetchOriginal(input, init);
      if (!ehProprioMonitor && res.status >= 400) {
        const ehSupabase = url.includes("supabase.co");
        reportarErroMonitor({
          tipo: ehSupabase ? "supabase" : "http",
          mensagem: `HTTP ${res.status} em ${sanitizeUrl(url)}`,
          statusHttp: res.status,
        });
      }
      return res;
    } catch (err) {
      if (!ehProprioMonitor) {
        const nome = err instanceof Error ? err.name : "";
        reportarErroMonitor({
          tipo: nome === "AbortError" || nome === "TimeoutError" ? "timeout" : "network",
          mensagem: `${nome || "NetworkError"} em ${sanitizeUrl(url)}`,
        });
      }
      throw err;
    }
  };
}
