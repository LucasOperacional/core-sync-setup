/** Lembretes de WhatsApp: modelos de mensagem e disparos agendados (Evolution). */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPETICOES = ["unica", "diaria", "semanal", "mensal"];
const DIA_MS = 24 * 60 * 60 * 1000;

export type LembreteWhats = {
  id: string;
  titulo: string | null;
  numeros: string[];
  texto: string;
  agendado_para: string;
  proximo_envio_em: string | null;
  repeticao: string;
  status: string;
  ultimo_envio_em: string | null;
  erro: string | null;
};

export type TemplateWhats = { id: string; nome: string; texto: string };

function limparNumeros(entrada: unknown): string[] {
  const bruto = Array.isArray(entrada) ? entrada : String(entrada ?? "").split(/[\n,;]+/);
  const lista = bruto
    .map((n) => String(n ?? "").replace(/\D/g, ""))
    .filter((n) => n.length >= 10)
    .map((n) => (n.length <= 11 ? `55${n}` : n));
  return [...new Set(lista)].slice(0, 200);
}

/** Próximo horário conforme a repetição escolhida. */
function proximoHorario(base: Date, repeticao: string, agora = new Date()): Date | null {
  if (repeticao === "unica") return null;
  let proximo = new Date(base.getTime());
  let guarda = 0;
  while (proximo.getTime() <= agora.getTime() && guarda < 500) {
    if (repeticao === "mensal") proximo.setMonth(proximo.getMonth() + 1);
    else proximo = new Date(proximo.getTime() + (repeticao === "semanal" ? 7 * DIA_MS : DIA_MS));
    guarda += 1;
  }
  return proximo;
}

/** Lista os modelos de mensagem salvos. */
export const listarTemplatesLembrete = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<TemplateWhats[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_lembrete_templates" as never)
      .select("id, nome, texto")
      .order("nome", { ascending: true })
      .limit(200);
    return (data ?? []) as unknown as TemplateWhats[];
  });

/** Cria um modelo de mensagem. */
export const salvarTemplateLembrete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nome: string; texto: string }) => {
    const nome = String(input?.nome ?? "").trim().slice(0, 80);
    const texto = String(input?.texto ?? "").trim().slice(0, 3000);
    if (!nome) throw new Error("Informe o nome do modelo.");
    if (!texto) throw new Error("Informe o texto do modelo.");
    return { nome, texto };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wa_lembrete_templates" as never)
      .insert({ nome: data.nome, texto: data.texto, criado_por: userId } as never);
    return error ? { ok: false, erro: error.message } : { ok: true };
  });

/** Apaga um modelo de mensagem. */
export const excluirTemplateLembrete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!UUID.test(String(input?.id ?? ""))) throw new Error("Modelo inválido.");
    return { id: input.id };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; erro?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wa_lembrete_templates" as never)
      .delete()
      .eq("id", data.id);
    return error ? { ok: false, erro: error.message } : { ok: true };
  });

/** Lista os lembretes agendados. */
export const listarLembretes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<LembreteWhats[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_lembretes" as never)
      .select(
        "id, titulo, numeros, texto, agendado_para, proximo_envio_em, repeticao, status, ultimo_envio_em, erro",
      )
      .order("proximo_envio_em", { ascending: true, nullsFirst: false })
      .order("agendado_para", { ascending: false })
      .limit(100);
    return (data ?? []) as unknown as LembreteWhats[];
  });

/** Agenda um novo lembrete. */
export const criarLembrete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      titulo?: string;
      numeros: string[] | string;
      texto: string;
      quando: string;
      repeticao?: string;
    }) => {
      const numeros = limparNumeros(input?.numeros);
      if (numeros.length === 0) throw new Error("Informe ao menos um número de WhatsApp.");
      const texto = String(input?.texto ?? "").trim().slice(0, 3000);
      if (!texto) throw new Error("Escreva a mensagem do lembrete.");
      const quando = new Date(String(input?.quando ?? ""));
      if (Number.isNaN(quando.getTime())) throw new Error("Data e hora inválidas.");
      const repeticao = REPETICOES.includes(String(input?.repeticao))
        ? String(input.repeticao)
        : "unica";
      return {
        titulo: String(input?.titulo ?? "").trim().slice(0, 80),
        numeros,
        texto,
        quando: quando.toISOString(),
        repeticao,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("wa_lembretes" as never).insert({
      titulo: data.titulo || null,
      numeros: data.numeros,
      texto: data.texto,
      agendado_para: data.quando,
      proximo_envio_em: data.quando,
      repeticao: data.repeticao,
      status: "agendado",
      criado_por: userId,
    } as never);
    return error ? { ok: false, erro: error.message } : { ok: true };
  });

/** Cancela, reativa ou exclui um lembrete. */
export const alterarLembrete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; acao: "cancelar" | "reativar" | "excluir" }) => {
    if (!UUID.test(String(input?.id ?? ""))) throw new Error("Lembrete inválido.");
    if (!["cancelar", "reativar", "excluir"].includes(input?.acao))
      throw new Error("Ação inválida.");
    return { id: input.id, acao: input.acao };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; erro?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.acao === "excluir") {
      const { error } = await supabaseAdmin.from("wa_lembretes" as never).delete().eq("id", data.id);
      return error ? { ok: false, erro: error.message } : { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("wa_lembretes" as never)
      .update({ status: data.acao === "cancelar" ? "cancelado" : "agendado", erro: null } as never)
      .eq("id", data.id);
    return error ? { ok: false, erro: error.message } : { ok: true };
  });

/** Envia os lembretes cujo horário já chegou (usado pelo painel e pelo agendador). */
export async function dispararLembretesVencidos(): Promise<{
  processados: number;
  enviados: number;
  falhas: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { enviarMensagemEvolution } = await import("@/lib/evolution-go.functions");
  const agora = new Date();

  const { data } = await supabaseAdmin
    .from("wa_lembretes" as never)
    .select("id, numeros, texto, agendado_para, proximo_envio_em, repeticao")
    .eq("status", "agendado")
    .lte("proximo_envio_em", agora.toISOString())
    .limit(50);

  const pendentes = (data ?? []) as unknown as Array<{
    id: string;
    numeros: string[];
    texto: string;
    agendado_para: string;
    proximo_envio_em: string | null;
    repeticao: string;
  }>;

  let enviados = 0;
  let falhas = 0;

  for (const item of pendentes) {
    const erros: string[] = [];
    for (const numero of item.numeros ?? []) {
      const r = await enviarMensagemEvolution(numero, item.texto);
      if (r.ok) enviados += 1;
      else {
        falhas += 1;
        erros.push(`${numero}: ${r.erro ?? "falha"}`);
      }
    }
    const base = new Date(item.proximo_envio_em ?? item.agendado_para);
    const proximo = proximoHorario(base, item.repeticao, agora);
    await supabaseAdmin
      .from("wa_lembretes" as never)
      .update({
        status: proximo ? "agendado" : erros.length > 0 ? "falhou" : "enviado",
        proximo_envio_em: proximo ? proximo.toISOString() : null,
        ultimo_envio_em: agora.toISOString(),
        erro: erros.length > 0 ? erros.join(" | ").slice(0, 500) : null,
      } as never)
      .eq("id", item.id);
  }

  return { processados: pendentes.length, enviados, falhas };
}

/** Dispara agora os lembretes vencidos. */
export const processarLembretes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => dispararLembretesVencidos());

/** Envia a mensagem imediatamente para os números informados (teste). */
export const enviarLembreteAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { numeros: string[] | string; texto: string }) => {
    const numeros = limparNumeros(input?.numeros);
    if (numeros.length === 0) throw new Error("Informe ao menos um número de WhatsApp.");
    const texto = String(input?.texto ?? "").trim().slice(0, 3000);
    if (!texto) throw new Error("Escreva a mensagem.");
    return { numeros, texto };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; enviados: number; erro?: string }> => {
    const { enviarMensagemEvolution } = await import("@/lib/evolution-go.functions");
    let enviados = 0;
    const erros: string[] = [];
    for (const numero of data.numeros) {
      const r = await enviarMensagemEvolution(numero, data.texto);
      if (r.ok) enviados += 1;
      else erros.push(`${numero}: ${r.erro ?? "falha"}`);
    }
    return erros.length > 0
      ? { ok: enviados > 0, enviados, erro: erros.join(" | ") }
      : { ok: true, enviados };
  });
