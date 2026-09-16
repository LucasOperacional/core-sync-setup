/**
 * Log local das chamadas feitas à API do Gemini (monitoramento de uso).
 * Guarda modelo, rótulo da chamada, status HTTP, tempo de resposta, tokens
 * e um recorte da resposta — sem imagens nem payloads gigantes.
 */

const KEY = "gemini-chamadas-log-v1";
const LIMITE = 120;
export const GEMINI_LOG_EVENT = "gemini-log-sync";

export interface GeminiChamadaLog {
  id: string;
  inicio: string;
  duracaoMs: number;
  rotulo: string;
  modelo: string;
  status: number;
  ok: boolean;
  cached: boolean;
  tentativas: number;
  promptChars: number;
  temImagem: boolean;
  promptTokens: number;
  completionTokens: number;
  resposta: string;
  erro?: string;
}

export function lerLogGemini(): GeminiChamadaLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as GeminiChamadaLog[]) : [];
  } catch {
    return [];
  }
}

function salvar(itens: GeminiChamadaLog[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(itens.slice(0, LIMITE)));
  } catch {
    /* storage cheio */
  }
  window.dispatchEvent(new Event(GEMINI_LOG_EVENT));
}

export function registrarChamadaGemini(entrada: Omit<GeminiChamadaLog, "id">): GeminiChamadaLog[] {
  const item: GeminiChamadaLog = {
    ...entrada,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    resposta: entrada.resposta.slice(0, 1200),
  };
  const proximos = [item, ...lerLogGemini()];
  salvar(proximos);
  return proximos;
}

export function limparLogGemini(): GeminiChamadaLog[] {
  salvar([]);
  return [];
}

export interface GeminiLogResumo {
  total: number;
  sucessos: number;
  falhas: number;
  cacheados: number;
  tempoMedioMs: number;
  tempoMaxMs: number;
  tokens: number;
}

export function resumirLogGemini(itens: GeminiChamadaLog[]): GeminiLogResumo {
  const reais = itens.filter((i) => !i.cached);
  const soma = reais.reduce((acc, i) => acc + i.duracaoMs, 0);
  return {
    total: itens.length,
    sucessos: itens.filter((i) => i.ok).length,
    falhas: itens.filter((i) => !i.ok).length,
    cacheados: itens.filter((i) => i.cached).length,
    tempoMedioMs: reais.length ? Math.round(soma / reais.length) : 0,
    tempoMaxMs: reais.reduce((acc, i) => Math.max(acc, i.duracaoMs), 0),
    tokens: itens.reduce((acc, i) => acc + i.promptTokens + i.completionTokens, 0),
  };
}
