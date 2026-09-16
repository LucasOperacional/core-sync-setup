import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, requestNexti } from "@/lib/nexti.functions";

export type DirectSyncResultado = {
  ok: boolean;
  criadas: number;
  atualizadas: number;
  total: number;
  erro?: string;
};

export type DirectMensagensResultado = {
  ok: boolean;
  recebidas: number;
  conversas: number;
  endpoint?: string;
  erro?: string;
};

export type DirectEnvioResultado = {
  ok: boolean;
  entregue: boolean;
  endpoint?: string;
  erro?: string;
};

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Caminhos possíveis do Direct na NEXTI (o primeiro que responder é usado). */
const ENDPOINTS_RECEBER = [
  "/api/messages/all",
  "/api/messages",
  "/api/chat/messages",
  "/api/direct/messages",
];
const ENDPOINTS_ENVIAR = ["/api/messages", "/api/chat/messages", "/api/direct/messages"];

const CHAVE_RECEBER = "nexti_direct_endpoint_receber";
const CHAVE_ENVIAR = "nexti_direct_endpoint_enviar";

type Admin = {
  from: (tabela: string) => any;
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function lerConfig(db: Admin, chave: string): Promise<string> {
  const { data } = await db.from("app_config").select("valor").eq("chave", chave).maybeSingle();
  return texto((data as { valor?: unknown } | null)?.valor);
}

async function gravarConfig(db: Admin, chave: string, valor: string): Promise<void> {
  await db.from("app_config").upsert({ chave, valor }, { onConflict: "chave" });
}

/** Monta a lista de caminhos a tentar, começando pelo que já funcionou antes. */
function caminhos(salvo: string, padroes: string[]): string[] {
  const lista = salvo ? [salvo, ...padroes.filter((p) => p !== salvo)] : [...padroes];
  return lista;
}

/** Extrai um array de mensagens de qualquer formato de resposta da NEXTI. */
function extrairLista(resposta: unknown): Record<string, unknown>[] {
  if (Array.isArray(resposta)) return resposta as Record<string, unknown>[];
  if (resposta && typeof resposta === "object") {
    const obj = resposta as Record<string, unknown>;
    for (const chave of ["content", "data", "items", "messages", "results", "list"]) {
      const valor = obj[chave];
      if (Array.isArray(valor)) return valor as Record<string, unknown>[];
    }
  }
  return [];
}

function primeiro(obj: Record<string, unknown>, chaves: string[]): unknown {
  for (const c of chaves) {
    const v = obj[c];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

type MensagemNexti = {
  idExterno: string;
  pessoaId: number;
  conteudo: string;
  criadaEm: string;
  daEmpresa: boolean;
};

function normalizarMensagem(bruta: Record<string, unknown>): MensagemNexti | null {
  const conteudo = texto(
    primeiro(bruta, ["message", "mensagem", "text", "texto", "content", "body"]) as string,
  );
  if (!conteudo) return null;

  const pessoa = Number(
    primeiro(bruta, ["personId", "person_id", "pessoaId", "employeeId", "senderId", "userId"]) ?? 0,
  );
  if (!Number.isFinite(pessoa) || pessoa <= 0) return null;

  const idExterno = texto(
    String(primeiro(bruta, ["id", "messageId", "uuid", "codigo"]) ?? `${pessoa}-${conteudo}`),
  );

  const dataBruta = primeiro(bruta, [
    "sentAt",
    "createdAt",
    "created_at",
    "date",
    "data",
    "dataEnvio",
  ]);
  const criadaEm = dataBruta ? new Date(String(dataBruta)) : new Date();

  const sentido = texto(
    String(primeiro(bruta, ["direction", "sentido", "origin", "origem", "type"]) ?? ""),
  ).toUpperCase();
  const daEmpresa =
    sentido.includes("OUT") || sentido.includes("ENVI") || sentido.includes("AGENT");

  return {
    idExterno,
    pessoaId: pessoa,
    conteudo,
    criadaEm: (Number.isNaN(criadaEm.getTime()) ? new Date() : criadaEm).toISOString(),
    daEmpresa,
  };
}

/**
 * Sincroniza as conversas DIRECT a partir dos colaboradores da NEXTI.
 * Cada colaborador em situação de trabalho vira uma conversa DIRECT.
 */
export const sincronizarDirectNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<DirectSyncResultado> => {
    try {
      const db = await admin();

      const { data: pessoas, error } = await db
        .from("nexti_persons")
        .select("nexti_id, nome, matricula, workplace_name, career_name, situacao")
        .limit(20000);
      if (error) throw error;

      const ativas = ((pessoas ?? []) as Record<string, unknown>[]).filter((p) => {
        const situacao = texto(p["situacao"]).toUpperCase();
        if (!situacao) return true;
        return situacao.startsWith("TRABALH") || situacao.startsWith("ATIV");
      });

      const { data: existentes } = await db
        .from("chat_direct_conversations")
        .select("nexti_person_id")
        .limit(50000);
      const jaExistem = new Set(
        ((existentes ?? []) as Array<{ nexti_person_id: number }>).map((r) =>
          Number(r.nexti_person_id),
        ),
      );

      const linhas = ativas
        .map((raw) => {
          const id = Number(raw["nexti_id"]);
          if (!Number.isFinite(id)) return null;
          const nome = texto(raw["nome"]);
          if (!nome) return null;
          return {
            nexti_person_id: id,
            contato_nome: nome,
            contato_matricula: texto(raw["matricula"]) || null,
            contato_posto: texto(raw["workplace_name"]) || null,
            contato_cargo: texto(raw["career_name"]) || null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      let criadas = 0;
      let atualizadas = 0;
      for (let i = 0; i < linhas.length; i += 500) {
        const lote = linhas.slice(i, i + 500);
        const { error: upErro } = await db
          .from("chat_direct_conversations")
          .upsert(lote, { onConflict: "nexti_person_id" });
        if (upErro) throw upErro;
        for (const l of lote) {
          if (jaExistem.has(l.nexti_person_id)) atualizadas++;
          else criadas++;
        }
      }

      return { ok: true, criadas, atualizadas, total: linhas.length };
    } catch (e) {
      return {
        ok: false,
        criadas: 0,
        atualizadas: 0,
        total: 0,
        erro: e instanceof Error ? e.message : String(e),
      };
    }
  });

/**
 * Importa para o Direct as mensagens que chegaram na NEXTI, guardando cada uma
 * na conversa do colaborador correspondente.
 */
export const sincronizarMensagensDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<DirectMensagensResultado> => {
    try {
      const db = await admin();
      const config = await loadConfig();
      const salvo = await lerConfig(db, CHAVE_RECEBER);

      const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let lista: Record<string, unknown>[] = [];
      let endpointUsado = "";
      let ultimoErro = "";

      for (const caminho of caminhos(salvo, ENDPOINTS_RECEBER)) {
        try {
          const resposta = await requestNexti({
            config,
            endpoint: caminho,
            method: "GET",
            query: { size: 500, since: desde },
          });
          lista = extrairLista(resposta.data);
          endpointUsado = caminho;
          break;
        } catch (e) {
          ultimoErro = e instanceof Error ? e.message : String(e);
        }
      }

      if (!endpointUsado) {
        const negado = /403|negou acesso|permission/i.test(ultimoErro);
        const inexistente =
          /404|405|400|não encontrado|invalid_url_or_endpoint|inválid|invalid/i.test(ultimoErro);
        return {
          ok: false,
          recebidas: 0,
          conversas: 0,
          erro: negado
            ? "A NEXTI não liberou a leitura do Direct para estas credenciais. Peça à NEXTI a permissão de mensagens para o seu Client ID."
            : inexistente
              ? "A NEXTI ainda não disponibiliza a leitura das mensagens do Direct para esta conta — por enquanto só é possível enviar mensagens por aqui."
              : ultimoErro || "NEXTI indisponível.",
        };
      }
      if (endpointUsado !== salvo) await gravarConfig(db, CHAVE_RECEBER, endpointUsado);

      const mensagens = lista.map(normalizarMensagem).filter((m): m is MensagemNexti => m !== null);
      if (mensagens.length === 0) {
        return { ok: true, recebidas: 0, conversas: 0, endpoint: endpointUsado };
      }

      const pessoas = [...new Set(mensagens.map((m) => m.pessoaId))];
      const { data: conversas } = await db
        .from("chat_direct_conversations")
        .select("id, nexti_person_id")
        .in("nexti_person_id", pessoas);

      const porPessoa = new Map<number, string>();
      for (const c of (conversas ?? []) as Array<{ id: string; nexti_person_id: number }>) {
        porPessoa.set(Number(c.nexti_person_id), c.id);
      }

      const linhas = mensagens
        .filter((m) => porPessoa.has(m.pessoaId))
        .map((m) => ({
          conversation_id: porPessoa.get(m.pessoaId)!,
          user_id: null,
          autor: m.daEmpresa ? "agente" : "contato",
          content: m.conteudo,
          created_at: m.criadaEm,
          nexti_message_id: m.idExterno,
          entregue: true,
        }));

      let recebidas = 0;
      for (let i = 0; i < linhas.length; i += 500) {
        const lote = linhas.slice(i, i + 500);
        const { error } = await db
          .from("chat_direct_messages")
          .upsert(lote, { onConflict: "nexti_message_id", ignoreDuplicates: true });
        if (error) throw error;
        recebidas += lote.length;
      }

      const agora = new Date().toISOString();
      const tocadas = [...new Set(linhas.map((l) => l.conversation_id))];
      for (const id of tocadas) {
        await db
          .from("chat_direct_conversations")
          .update({ last_message_at: agora, ultima_leitura_nexti: agora })
          .eq("id", id);
      }

      return { ok: true, recebidas, conversas: tocadas.length, endpoint: endpointUsado };
    } catch (e) {
      return {
        ok: false,
        recebidas: 0,
        conversas: 0,
        erro: e instanceof Error ? e.message : String(e),
      };
    }
  });

/**
 * Envia a resposta do atendente para o Direct da NEXTI e registra a mensagem
 * na conversa, marcando se a entrega foi confirmada.
 */
export const responderDirectNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; texto: string }) => {
    const conversationId = texto(input?.conversationId);
    const mensagem = texto(input?.texto);
    if (!conversationId) throw new Error("Conversa não informada.");
    if (!mensagem) throw new Error("Escreva a mensagem antes de enviar.");
    return { conversationId, texto: mensagem };
  })
  .handler(async ({ data, context }): Promise<DirectEnvioResultado> => {
    const db = await admin();

    const { data: conversa } = await db
      .from("chat_direct_conversations")
      .select("id, nexti_person_id, contato_matricula")
      .eq("id", data.conversationId)
      .maybeSingle();

    if (!conversa) return { ok: false, entregue: false, erro: "Conversa não encontrada." };

    const pessoaId = Number((conversa as { nexti_person_id: number }).nexti_person_id);
    let entregue = false;
    let endpointUsado = "";
    let erro = "";

    try {
      const config = await loadConfig();
      const salvo = await lerConfig(db, CHAVE_ENVIAR);

      for (const caminho of caminhos(salvo, ENDPOINTS_ENVIAR)) {
        try {
          await requestNexti({
            config,
            endpoint: caminho,
            method: "POST",
            body: {
              personId: pessoaId,
              message: data.texto,
              text: data.texto,
              direction: "OUTBOUND",
            },
          });
          entregue = true;
          endpointUsado = caminho;
          break;
        } catch (e) {
          erro = e instanceof Error ? e.message : String(e);
        }
      }

      if (entregue && endpointUsado !== salvo) await gravarConfig(db, CHAVE_ENVIAR, endpointUsado);
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }

    const agora = new Date().toISOString();
    const { error: erroInsert } = await db.from("chat_direct_messages").insert({
      conversation_id: data.conversationId,
      user_id: context.userId,
      autor: "agente",
      content: data.texto,
      entregue,
      erro_envio: entregue ? null : erro || "A NEXTI não confirmou a entrega.",
    });
    if (erroInsert) {
      return { ok: false, entregue, erro: erroInsert.message ?? String(erroInsert) };
    }

    await db
      .from("chat_direct_conversations")
      .update({ last_message_at: agora })
      .eq("id", data.conversationId);

    return {
      ok: true,
      entregue,
      ...(endpointUsado ? { endpoint: endpointUsado } : {}),
      ...(entregue ? {} : { erro: erro || "A NEXTI não confirmou a entrega." }),
    };
  });
