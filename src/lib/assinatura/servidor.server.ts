/**
 * Apoio de servidor do módulo Assinatura de Documentos.
 * Só é carregado dentro de handlers (nunca vai para o navegador).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "assinaturas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

export function bytesAleatorios(tamanho = 32): string {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashTexto(valor: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function gerarProtocolo(): string {
  const agora = new Date();
  const data = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, "0")}${String(agora.getDate()).padStart(2, "0")}`;
  return `ASS-${data}-${bytesAleatorios(3).toUpperCase()}`;
}

export function base64ParaBytes(base64: string): Uint8Array {
  const limpo = base64.includes(",") ? base64.split(",")[1]! : base64;
  const binario = atob(limpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function bytesParaBase64(bytes: Uint8Array): string {
  let binario = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(binario);
}

export async function enviarArquivo(
  caminho: string,
  bytes: Uint8Array,
  contentType = "application/pdf",
): Promise<void> {
  const cliente = await admin();
  const { error } = await cliente.storage
    .from(BUCKET)
    .upload(caminho, new Blob([new Uint8Array(bytes)], { type: contentType }), {
      contentType,
      upsert: true,
    });
  if (error) throw new Error("Não foi possível guardar o arquivo com segurança.");
}

export async function baixarArquivo(caminho: string): Promise<Uint8Array> {
  const cliente = await admin();
  const { data, error } = await cliente.storage.from(BUCKET).download(caminho);
  if (error || !data) throw new Error("Arquivo do documento não encontrado.");
  return new Uint8Array(await data.arrayBuffer());
}

/** URL temporária (padrão: 10 minutos). */
export async function urlTemporaria(
  caminho: string | null,
  segundos = 600,
): Promise<string | null> {
  if (!caminho) return null;
  const cliente = await admin();
  const { data } = await cliente.storage.from(BUCKET).createSignedUrl(caminho, segundos);
  return data?.signedUrl ?? null;
}

export async function registrarAuditoria(entrada: {
  documentoId: string;
  signatarioId?: string | null;
  evento: string;
  detalhe?: string | null;
  ip?: string | null;
  dispositivo?: string | null;
}): Promise<void> {
  try {
    const cliente = await admin();
    await cliente.from("assinatura_auditoria").insert({
      documento_id: entrada.documentoId,
      signatario_id: entrada.signatarioId ?? null,
      evento: entrada.evento,
      detalhe: entrada.detalhe ?? null,
      ip: entrada.ip ?? null,
      dispositivo: (entrada.dispositivo ?? "").slice(0, 240) || null,
    });
  } catch {
    // A auditoria nunca interrompe a operação do usuário.
  }
}

export function ipDaRequisicao(request: Request): string | null {
  const cabecalhos = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"];
  for (const nome of cabecalhos) {
    const valor = request.headers.get(nome);
    if (valor) return valor.split(",")[0]!.trim();
  }
  return null;
}

export function dispositivoDaRequisicao(request: Request): string | null {
  return request.headers.get("user-agent")?.slice(0, 240) ?? null;
}

/** Recalcula o status do documento a partir dos signatários. */
export function statusPorSignatarios(
  signatarios: Array<{ status: string }>,
): "aguardando_assinatura" | "assinado_parcialmente" | "concluido" | "recusado" {
  if (signatarios.some((s) => s.status === "recusado")) return "recusado";
  const assinados = signatarios.filter((s) => s.status === "assinado").length;
  if (assinados === 0) return "aguardando_assinatura";
  if (assinados < signatarios.length) return "assinado_parcialmente";
  return "concluido";
}
