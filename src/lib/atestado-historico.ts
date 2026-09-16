/**
 * Histórico local das leituras do Gemini no Verificador de Atestados.
 * As imagens melhoradas não são persistidas (payload muito grande); elas ficam
 * disponíveis apenas na sessão atual, junto com o arquivo original.
 */
import type { AtestadoAnaliseIA } from "./atestado-ia";

const KEY = "atestados-historico-gemini-v1";
const LIMITE = 40;

export interface AtestadoHistoricoItem extends Omit<AtestadoAnaliseIA, "paginas"> {
  paginas: string[];
  status: "analisado" | "descartado";
}

/** Arquivos originais da sessão, para permitir reanálise sem novo upload. */
const arquivosSessao = new Map<string, File>();

export function guardarArquivoSessao(id: string, file: File): void {
  arquivosSessao.set(id, file);
}

export function obterArquivoSessao(id: string): File | undefined {
  return arquivosSessao.get(id);
}

export function lerHistorico(): AtestadoHistoricoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AtestadoHistoricoItem[]) : [];
  } catch {
    return [];
  }
}

function salvar(itens: AtestadoHistoricoItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(itens.slice(0, LIMITE)));
  } catch {
    /* storage cheio */
  }
  window.dispatchEvent(new Event("atestados-historico-sync"));
}

export function registrarAnalise(analise: AtestadoAnaliseIA): AtestadoHistoricoItem[] {
  const item: AtestadoHistoricoItem = {
    ...analise,
    paginas: [], // não persistimos imagens
    status: "analisado",
  };
  const atuais = lerHistorico().filter((i) => i.id !== item.id);
  const proximos = [item, ...atuais];
  salvar(proximos);
  return proximos;
}

export function descartarItem(id: string): AtestadoHistoricoItem[] {
  const proximos = lerHistorico().map((i) =>
    i.id === id ? { ...i, status: "descartado" as const } : i,
  );
  salvar(proximos);
  return proximos;
}

export function removerItem(id: string): AtestadoHistoricoItem[] {
  const proximos = lerHistorico().filter((i) => i.id !== id);
  arquivosSessao.delete(id);
  salvar(proximos);
  return proximos;
}

export function limparHistorico(): AtestadoHistoricoItem[] {
  salvar([]);
  arquivosSessao.clear();
  return [];
}
