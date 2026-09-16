import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const crtSchema = z.object({
  colaborador: z.string().min(1),
  personId: z.string().default(""),
  postoNome: z.string().default(""),
  postoId: z.string().default(""),
  motivo: z.string().default(""),
  inicio: z.string().default(""),
  fim: z.string().default(""),
  supervisor: z.string().default(""),
  substituto: z.string().default(""),
  substitutoPersonId: z.string().default(""),
  recebeuVt: z.string().default(""),
  recebeuRefeicao: z.string().default(""),
  valorReceber: z.string().default(""),
  recebidoEm: z.string().default(""),
  /** Origem (https://...) usada para montar o link público de assinatura. */
  origemUrl: z.string().url().optional().default(""),
});

/** Token hexadecimal usado no link público de assinatura do CRT. */
function gerarTokenAssinatura(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type CrtLancamento = {
  id: string;
  colaborador: string;
  person_id: string | null;
  posto_nome: string;
  posto_id: string | null;
  motivo: string;
  inicio: string | null;
  fim: string | null;
  supervisor: string;
  substituto: string;
  substituto_person_id: string | null;
  recebeu_vt: string;
  recebeu_refeicao: string;
  valor_receber: string;
  recebido_em: string | null;
  status: string;
  enviado_por_nome: string | null;
  lancado_por_nome: string | null;
  lancado_em: string | null;
  created_at: string;
  assinatura_colaborador?: string | null;
};

/** Envia um CRT preenchido pela supervisão para a coordenação. */
export const enviarCrtParaCoordenacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => crtSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: perfilEnvio } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();
    const enviadoPorNome =
      (perfilEnvio?.nome as string | undefined) ||
      (perfilEnvio?.email as string | undefined) ||
      (context.claims?.email as string | undefined) ||
      data.supervisor ||
      "Usuário";

    const token = gerarTokenAssinatura();
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error, data: inserido } = await context.supabase
      .from("crt_lancamentos")
      .insert({
        criado_por: context.userId,
        colaborador: data.colaborador,
        person_id: data.personId || null,
        posto_nome: data.postoNome,
        posto_id: data.postoId || null,
        motivo: data.motivo,
        inicio: data.inicio ? new Date(data.inicio).toISOString() : null,
        fim: data.fim ? new Date(data.fim).toISOString() : null,
        supervisor: data.supervisor,
        substituto: data.substituto,
        substituto_person_id: data.substitutoPersonId || null,
        recebeu_vt: data.recebeuVt,
        recebeu_refeicao: data.recebeuRefeicao,
        valor_receber: data.valorReceber,
        recebido_em: data.recebidoEm || null,
        enviado_por_nome: enviadoPorNome,
        assinatura_token: token,
        assinatura_token_expira_em: expiraEm,
        status: "pendente",
      })
      .select("id")
      .single();

    if (error) return { ok: false as const, erro: error.message };
    const origem = data.origemUrl.replace(/\/+$/, "");
    return {
      ok: true as const,
      id: inserido.id as string,
      linkAssinatura: origem ? `${origem}/assinar-crt/${token}` : "",
    };
  });

/** Lista os CRTs enviados para a coordenação. */
export const listarCrtLancamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crt_lancamentos")
      .select(
        "id, colaborador, person_id, posto_nome, posto_id, motivo, inicio, fim, supervisor, substituto, substituto_person_id, recebeu_vt, recebeu_refeicao, valor_receber, recebido_em, status, enviado_por_nome, lancado_por_nome, lancado_em, created_at, assinatura_colaborador",
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (error)
      return { ok: false as const, erro: error.message, lancamentos: [] as CrtLancamento[] };
    return { ok: true as const, lancamentos: (data ?? []) as CrtLancamento[] };
  });

/** Marca um CRT como lançado (ou volta para pendente). */
export const atualizarStatusCrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), status: z.enum(["pendente", "lancado"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    let nome = "";
    if (data.status === "lancado") {
      const { data: perfil } = await context.supabase
        .from("profiles")
        .select("nome, email")
        .eq("id", context.userId)
        .maybeSingle();
      nome =
        (perfil?.nome as string | undefined) ||
        (perfil?.email as string | undefined) ||
        (context.claims?.email as string | undefined) ||
        "Usuário";
    }

    const { error } = await context.supabase
      .from("crt_lancamentos")
      .update({
        status: data.status,
        lancado_por: data.status === "lancado" ? context.userId : null,
        lancado_por_nome: data.status === "lancado" ? nome : null,
        lancado_em: data.status === "lancado" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) return { ok: false as const, erro: error.message };
    return { ok: true as const, lancadoPorNome: nome, lancadoEm: new Date().toISOString() };
  });
