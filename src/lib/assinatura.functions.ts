/**
 * Módulo Assinatura de Documentos — operações do emissor (autenticado).
 *
 * As consultas ao banco usam o cliente do próprio usuário (RLS ativa).
 * Os arquivos ficam num espaço privado e só são acessados por URLs
 * temporárias geradas no servidor.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CampoDocumento,
  DocumentoAssinatura,
  EventoAuditoria,
  SignatarioAssinatura,
} from "./assinatura/tipos";

const campoSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum([
    "nome",
    "cpf",
    "matricula",
    "empresa",
    "posto",
    "cargo",
    "data",
    "observacao",
    "texto",
    "rubrica",
    "assinatura",
  ]),
  rotulo: z.string().default(""),
  pagina: z.number().int().min(1).default(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.01).max(1),
  h: z.number().min(0.005).max(1),
  obrigatorio: z.boolean().default(true),
  valor: z.string().default(""),
  signatario: z.number().int().min(1).nullable().default(null),
});

export interface DocumentoCompleto {
  documento: DocumentoAssinatura;
  signatarios: SignatarioAssinatura[];
  auditoria: EventoAuditoria[];
  urls: { original: string | null; preenchido: string | null; assinado: string | null };
}

const COLUNAS_DOC =
  "id,titulo,tipo,status,protocolo,original_path,preenchido_path,assinado_path,hash_sha256,campos,exige_codigo,expira_em,criado_por_nome,concluido_em,cancelado_em,created_at,updated_at";
const COLUNAS_SIG =
  "id,nome,email,telefone,ordem,status,visualizado_em,assinado_em,recusado_em,motivo_recusa,ip,dispositivo";

/** Cria o documento a partir de um PDF importado. */
export const criarDocumentoAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        titulo: z.string().min(1).max(160),
        tipo: z.enum(["crt", "pdf"]).default("pdf"),
        arquivoBase64: z.string().min(100),
        campos: z.array(campoSchema).default([]),
        exigeCodigo: z.boolean().default(false),
        expiraEm: z.string().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; protocolo: string }> => {
    const { enviarArquivo, base64ParaBytes, gerarProtocolo, registrarAuditoria } =
      await import("./assinatura/servidor.server");

    const bytes = base64ParaBytes(data.arquivoBase64);
    if (bytes.length > 20 * 1024 * 1024) throw new Error("O PDF deve ter até 20 MB.");
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") {
      throw new Error("Envie um arquivo PDF válido.");
    }

    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    const protocolo = gerarProtocolo();
    const { data: criado, error } = await context.supabase
      .from("assinatura_documentos")
      .insert({
        user_id: context.userId,
        titulo: data.titulo,
        tipo: data.tipo,
        status: "rascunho",
        protocolo,
        campos: data.campos,
        exige_codigo: data.exigeCodigo,
        expira_em: data.expiraEm,
        criado_por_nome: perfil?.display_name ?? null,
      })
      .select("id,protocolo")
      .single();
    if (error || !criado) throw new Error("Não foi possível criar o documento.");

    const caminho = `${criado.id}/original.pdf`;
    await enviarArquivo(caminho, bytes);
    await context.supabase
      .from("assinatura_documentos")
      .update({ original_path: caminho })
      .eq("id", criado.id);

    await registrarAuditoria({
      documentoId: criado.id,
      evento: "documento_criado",
      detalhe: `Protocolo ${protocolo}`,
    });

    return { id: criado.id, protocolo: criado.protocolo };
  });

/** Lista os documentos visíveis ao usuário. */
export const listarDocumentosAssinatura = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<Array<DocumentoAssinatura & { total_signatarios: number; assinados: number }>> => {
      const { data, error } = await context.supabase
        .from("assinatura_documentos")
        .select(`${COLUNAS_DOC},assinatura_signatarios(status)`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error("Não foi possível carregar os documentos.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((d) => {
        const sig = (d.assinatura_signatarios ?? []) as Array<{ status: string }>;
        const { assinatura_signatarios: _ignorado, ...resto } = d;
        return {
          ...(resto as DocumentoAssinatura),
          total_signatarios: sig.length,
          assinados: sig.filter((s) => s.status === "assinado").length,
        };
      });
    },
  );

/** Detalhes completos, com URLs temporárias e histórico. */
export const obterDocumentoAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DocumentoCompleto> => {
    const { urlTemporaria } = await import("./assinatura/servidor.server");
    const { data: documento, error } = await context.supabase
      .from("assinatura_documentos")
      .select(COLUNAS_DOC)
      .eq("id", data.id)
      .maybeSingle();
    if (error || !documento) throw new Error("Documento não encontrado.");

    const { data: signatarios } = await context.supabase
      .from("assinatura_signatarios")
      .select(COLUNAS_SIG)
      .eq("documento_id", data.id)
      .order("ordem");

    const { data: auditoria } = await context.supabase
      .from("assinatura_auditoria")
      .select("id,evento,detalhe,ip,dispositivo,created_at")
      .eq("documento_id", data.id)
      .order("created_at", { ascending: false })
      .limit(100);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = documento as any as DocumentoAssinatura;
    return {
      documento: doc,
      signatarios: (signatarios ?? []) as unknown as SignatarioAssinatura[],
      auditoria: (auditoria ?? []) as unknown as EventoAuditoria[],
      urls: {
        original: await urlTemporaria(doc.original_path),
        preenchido: await urlTemporaria(doc.preenchido_path),
        assinado: await urlTemporaria(doc.assinado_path),
      },
    };
  });

/** Salva a posição dos campos e gera a versão preenchida do PDF. */
export const salvarCamposAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        titulo: z.string().min(1).max(160).optional(),
        campos: z.array(campoSchema),
        exigeCodigo: z.boolean().optional(),
        expiraEm: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { baixarArquivo, enviarArquivo, registrarAuditoria } =
      await import("./assinatura/servidor.server");
    const { aplicarCamposNoPdf } = await import("./assinatura/pdf-assinatura");

    const { data: documento } = await context.supabase
      .from("assinatura_documentos")
      .select("id,status,original_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!documento?.original_path) throw new Error("Documento não encontrado.");
    if (["concluido", "cancelado"].includes(documento.status)) {
      throw new Error("Este documento não pode mais ser alterado.");
    }

    const original = await baixarArquivo(documento.original_path);
    const valores: Record<string, string> = {};
    for (const campo of data.campos) if (campo.valor) valores[campo.id] = campo.valor;
    const preenchido = await aplicarCamposNoPdf(original, data.campos as CampoDocumento[], valores);
    const caminho = `${data.id}/preenchido.pdf`;
    await enviarArquivo(caminho, preenchido);

    const atualizacao: {
      campos: unknown;
      preenchido_path: string;
      titulo?: string;
      exige_codigo?: boolean;
      expira_em?: string | null;
    } = {
      campos: data.campos,
      preenchido_path: caminho,
    };
    if (data.titulo) atualizacao.titulo = data.titulo;
    if (data.exigeCodigo !== undefined) atualizacao.exige_codigo = data.exigeCodigo;
    if (data.expiraEm !== undefined) atualizacao.expira_em = data.expiraEm;

    const { error } = await context.supabase
      .from("assinatura_documentos")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(atualizacao as any)
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível salvar o preenchimento.");

    await registrarAuditoria({
      documentoId: data.id,
      evento: "documento_preenchido",
      detalhe: `${data.campos.length} campo(s) posicionado(s)`,
    });
    return { ok: true };
  });

export interface LinkSignatario {
  signatarioId: string;
  nome: string;
  link: string;
}

/** Cadastra os signatários e devolve o link individual de cada um. */
export const definirSignatarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        origem: z.string().url(),
        signatarios: z
          .array(
            z.object({
              nome: z.string().min(2).max(120),
              email: z.string().email().nullable().default(null),
              telefone: z.string().max(40).nullable().default(null),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ links: LinkSignatario[] }> => {
    const { bytesAleatorios, hashTexto, registrarAuditoria } =
      await import("./assinatura/servidor.server");

    const { data: documento } = await context.supabase
      .from("assinatura_documentos")
      .select("id,status,preenchido_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!documento) throw new Error("Documento não encontrado.");
    if (documento.status === "cancelado") throw new Error("Documento cancelado.");
    if (!documento.preenchido_path) {
      throw new Error("Salve o preenchimento do documento antes de enviar para assinatura.");
    }

    await context.supabase.from("assinatura_signatarios").delete().eq("documento_id", data.id);

    const links: LinkSignatario[] = [];
    for (let i = 0; i < data.signatarios.length; i++) {
      const s = data.signatarios[i]!;
      const token = bytesAleatorios(32);
      const { data: criado, error } = await context.supabase
        .from("assinatura_signatarios")
        .insert({
          documento_id: data.id,
          nome: s.nome,
          email: s.email,
          telefone: s.telefone,
          ordem: i + 1,
          status: "enviado",
          token_hash: await hashTexto(token),
        })
        .select("id,nome")
        .single();
      if (error || !criado) throw new Error("Não foi possível cadastrar os signatários.");
      links.push({
        signatarioId: criado.id,
        nome: criado.nome,
        link: `${data.origem.replace(/\/$/, "")}/assinar/${token}`,
      });
    }

    await context.supabase
      .from("assinatura_documentos")
      .update({ status: "enviado" })
      .eq("id", data.id);
    await registrarAuditoria({
      documentoId: data.id,
      evento: "documento_enviado",
      detalhe: `${links.length} signatário(s)`,
    });
    return { links };
  });

/** Gera um novo link para um signatário (reenvio). */
export const reenviarLinkSignatario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ signatarioId: z.string().uuid(), origem: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ link: string }> => {
    const { bytesAleatorios, hashTexto, registrarAuditoria } =
      await import("./assinatura/servidor.server");
    const { data: signatario } = await context.supabase
      .from("assinatura_signatarios")
      .select("id,documento_id,status")
      .eq("id", data.signatarioId)
      .maybeSingle();
    if (!signatario) throw new Error("Signatário não encontrado.");
    if (signatario.status === "assinado") throw new Error("Este signatário já assinou.");

    const token = bytesAleatorios(32);
    const { error } = await context.supabase
      .from("assinatura_signatarios")
      .update({ token_hash: await hashTexto(token), status: "enviado" })
      .eq("id", data.signatarioId);
    if (error) throw new Error("Não foi possível gerar um novo link.");

    await registrarAuditoria({
      documentoId: signatario.documento_id,
      signatarioId: signatario.id,
      evento: "link_reenviado",
    });
    return { link: `${data.origem.replace(/\/$/, "")}/assinar/${token}` };
  });

/** Cancela o documento e invalida os links pendentes. */
export const cancelarDocumentoAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), motivo: z.string().max(300).default("") }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { bytesAleatorios, hashTexto, registrarAuditoria } =
      await import("./assinatura/servidor.server");
    const { data: pendentes } = await context.supabase
      .from("assinatura_signatarios")
      .select("id,status")
      .eq("documento_id", data.id);

    for (const s of pendentes ?? []) {
      if (s.status === "assinado") continue;
      await context.supabase
        .from("assinatura_signatarios")
        .update({ status: "cancelado", token_hash: await hashTexto(bytesAleatorios(32)) })
        .eq("id", s.id);
    }

    const { error } = await context.supabase
      .from("assinatura_documentos")
      .update({ status: "cancelado", cancelado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível cancelar o documento.");

    await registrarAuditoria({
      documentoId: data.id,
      evento: "documento_cancelado",
      detalhe: data.motivo || null,
    });
    return { ok: true };
  });

/** URL temporária para baixar uma das versões do documento. */
export const baixarDocumentoAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        versao: z.enum(["original", "preenchido", "assinado"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { urlTemporaria, registrarAuditoria } = await import("./assinatura/servidor.server");
    const { data: documento } = await context.supabase
      .from("assinatura_documentos")
      .select("original_path,preenchido_path,assinado_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!documento) throw new Error("Documento não encontrado.");
    const caminho =
      data.versao === "original"
        ? documento.original_path
        : data.versao === "preenchido"
          ? documento.preenchido_path
          : documento.assinado_path;
    const url = await urlTemporaria(caminho, 300);
    if (!url) throw new Error("Esta versão do documento ainda não está disponível.");
    await registrarAuditoria({
      documentoId: data.id,
      evento: "download",
      detalhe: `versão ${data.versao}`,
    });
    return { url };
  });

/** Modelos reutilizáveis (CRT e outros formulários). */
export const listarModelosAssinatura = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<Array<{ id: string; nome: string; tipo: string; campos: CampoDocumento[] }>> => {
      const { data } = await context.supabase
        .from("assinatura_modelos")
        .select("id,nome,tipo,campos")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as unknown as Array<{
        id: string;
        nome: string;
        tipo: string;
        campos: CampoDocumento[];
      }>;
    },
  );

export const salvarModeloAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        nome: z.string().min(2).max(120),
        tipo: z.enum(["crt", "pdf"]).default("pdf"),
        campos: z.array(campoSchema),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: criado, error } = await context.supabase
      .from("assinatura_modelos")
      .insert({
        user_id: context.userId,
        nome: data.nome,
        tipo: data.tipo,
        campos: data.campos,
      })
      .select("id")
      .single();
    if (error || !criado) throw new Error("Não foi possível salvar o modelo.");
    return { id: criado.id };
  });

export const excluirModeloAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await context.supabase.from("assinatura_modelos").delete().eq("id", data.id);
    return { ok: true };
  });
