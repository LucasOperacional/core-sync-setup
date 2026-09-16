/**
 * Manus AI — server functions (proxy para https://api.manus.ai).
 *
 * As chamadas passam pelo servidor para evitar CORS e não expor a chave em
 * requisições diretas do navegador. A chave é fornecida pelo cliente
 * (armazenada localmente pelo usuário no card "Manus AI").
 *
 * Endpoints usados (API v2):
 * - POST /v2/task.create        → cria a tarefa
 * - GET  /v2/task.listMessages  → polling de eventos
 * - POST /v2/task.sendMessage   → mensagem de continuação (multi-turno)
 * - GET  /v2/usage.availableCredits → saldo de créditos (teste de conexão)
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BASE_URL = "https://api.manus.ai";

const profileSchema = z.enum(["lite", "standard", "max"]).default("standard");

async function manusFetch(
  apiKey: string,
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-manus-api-key": apiKey,
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* resposta não-JSON */
  }
  return { status: res.status, json, text };
}

function erroDe(json: Record<string, unknown>, status: number, text: string): string {
  const err = json["error"] as { code?: string; message?: string } | undefined;
  if (err?.message) return `${err.code ?? "erro"}: ${err.message}`;
  if (status === 401 || status === 403) return "Chave de API inválida ou sem permissão.";
  if (status === 429)
    return "Limite de requisições da Manus atingido. Tente novamente em instantes.";
  return `HTTP ${status} ${text.slice(0, 200)}`;
}

/** Testa a conexão e retorna informações da conta (créditos disponíveis). */
export const manusTestarConexao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ apiKey: z.string().min(10) }).parse(data))
  .handler(async ({ data }) => {
    const inicio = Date.now();
    const creditos = await manusFetch(data.apiKey, "/v2/usage.availableCredits");
    const latencyMs = Date.now() - inicio;

    if (creditos.status === 200 && creditos.json["ok"] !== false) {
      const saldo =
        (creditos.json["available_credits"] as number | undefined) ??
        (creditos.json["credits"] as number | undefined) ??
        null;
      return { ok: true as const, latencyMs, credits: saldo, detalhe: "Conta Manus conectada." };
    }

    // Contas OAuth padrão não acessam usage.availableCredits — valida com task.list
    const tarefas = await manusFetch(data.apiKey, "/v2/task.list?limit=1");
    if (tarefas.status === 200 && tarefas.json["ok"] !== false) {
      return {
        ok: true as const,
        latencyMs: Date.now() - inicio,
        credits: null,
        detalhe: "Conta Manus conectada (saldo de créditos indisponível para esta chave).",
      };
    }

    return {
      ok: false as const,
      latencyMs,
      credits: null,
      erro: erroDe(tarefas.json, tarefas.status, tarefas.text),
    };
  });

type ManusEvento = {
  type?: string;
  assistant_message?: { content?: string };
  error_message?: { content?: string; error_type?: string };
  status_update?: {
    agent_status?: string;
    status_detail?: { waiting_for_event_type?: string; waiting_description?: string };
  };
};

/**
 * Cria (ou continua) uma tarefa Manus e aguarda a conclusão, devolvendo o texto
 * final do agente. O polling respeita um tempo máximo para não travar a UI.
 */
export const manusExecutarTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        apiKey: z.string().min(10),
        prompt: z.string().min(1).max(20000),
        taskId: z.string().min(1).max(64).optional(),
        agentProfile: profileSchema.optional(),
        locale: z.string().max(10).optional(),
        hideInTaskList: z.boolean().optional(),
        timeoutMs: z.number().min(10_000).max(280_000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const timeout = data.timeoutMs ?? 240_000;
    const limite = Date.now() + timeout;

    let taskId = data.taskId ?? "";

    if (taskId) {
      const envio = await manusFetch(data.apiKey, "/v2/task.sendMessage", {
        method: "POST",
        body: { task_id: taskId, message: { content: data.prompt } },
      });
      if (envio.status !== 200 || envio.json["ok"] === false) {
        throw new Error(erroDe(envio.json, envio.status, envio.text));
      }
    } else {
      const criada = await manusFetch(data.apiKey, "/v2/task.create", {
        method: "POST",
        body: {
          message: { content: data.prompt },
          agent_profile: data.agentProfile ?? "standard",
          locale: data.locale ?? "pt-BR",
          hide_in_task_list: data.hideInTaskList ?? true,
        },
      });
      if (criada.status !== 200 || criada.json["ok"] === false) {
        throw new Error(erroDe(criada.json, criada.status, criada.text));
      }
      const task = criada.json["task"] as { id?: string; task_url?: string } | undefined;
      taskId = task?.id ?? (criada.json["task_id"] as string | undefined) ?? "";
      if (!taskId) throw new Error("A Manus não retornou o identificador da tarefa.");
    }

    const respostas: string[] = [];
    let status = "running";
    let aviso: string | null = null;

    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 3000));

      const eventos = await manusFetch(
        data.apiKey,
        `/v2/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=30`,
      );
      if (eventos.status !== 200 || eventos.json["ok"] === false) {
        throw new Error(erroDe(eventos.json, eventos.status, eventos.text));
      }

      const lista = ((eventos.json["messages"] ?? eventos.json["events"] ?? []) as ManusEvento[])
        .slice()
        .reverse();

      respostas.length = 0;
      for (const ev of lista) {
        if (ev.type === "assistant_message" && ev.assistant_message?.content) {
          respostas.push(ev.assistant_message.content);
        }
        if (ev.type === "error_message" && ev.error_message?.content) {
          aviso = ev.error_message.content;
        }
        if (ev.type === "status_update" && ev.status_update?.agent_status) {
          status = ev.status_update.agent_status;
          if (status === "waiting") {
            aviso =
              ev.status_update.status_detail?.waiting_description ??
              "A tarefa está aguardando uma confirmação no aplicativo da Manus.";
          }
        }
      }

      if (status === "stopped" || status === "error" || status === "waiting") break;
    }

    const conteudo = respostas.join("\n\n").trim();

    if (!conteudo && aviso) throw new Error(aviso);
    if (!conteudo) {
      throw new Error(
        "A tarefa da Manus ainda está em execução. Acompanhe no app da Manus e tente novamente em instantes.",
      );
    }

    return {
      content: conteudo,
      taskId,
      status,
      aviso,
      model: `manus-${data.agentProfile ?? "standard"}`,
    };
  });
