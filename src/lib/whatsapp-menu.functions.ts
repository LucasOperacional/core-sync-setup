import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Menu de botões do WhatsApp (Evolution Go, POST /send/button).
 * Cada botão de resposta rápida (`reply`) carrega o id `fila:<queueId>`;
 * quando o contato clica, o recebedor (`/api/public/evolution-webhook`)
 * encaminha a conversa direto para a fila de atendimento cadastrada.
 * Regras da API: no máximo 3 botões `reply` e sem misturar com outros tipos.
 */

export type MenuBotao = { texto: string; queueId: string };

export type MenuConfig = {
  ativo: boolean;
  titulo: string;
  descricao: string;
  rodape: string;
  botoes: MenuBotao[];
};

const CHAVES = {
  ativo: "whatsapp_menu_ativo",
  titulo: "whatsapp_menu_titulo",
  descricao: "whatsapp_menu_descricao",
  rodape: "whatsapp_menu_rodape",
  botoes: "whatsapp_menu_botoes",
} as const;

export const MAX_BOTOES = 3;

const PADRAO: MenuConfig = {
  ativo: false,
  titulo: "Atendimento",
  descricao: "Escolha uma opção para falar com o setor certo:",
  rodape: "Selecione um botão abaixo",
  botoes: [],
};

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

async function salvarChave(chave: string, valor: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_config" as never)
    .upsert({ chave, valor, updated_at: new Date().toISOString() } as never, {
      onConflict: "chave",
    } as never);
}

/** Lê a configuração do menu (uso interno do servidor). */
export async function lerMenu(): Promise<MenuConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_config" as never)
    .select("chave, valor")
    .in("chave", Object.values(CHAVES));
  const mapa = new Map<string, string>();
  for (const l of (data ?? []) as Array<{ chave: string; valor: string | null }>) {
    if (l?.chave) mapa.set(l.chave, l.valor ?? "");
  }
  let botoes: MenuBotao[] = [];
  try {
    const bruto = JSON.parse(mapa.get(CHAVES.botoes) || "[]");
    if (Array.isArray(bruto)) {
      botoes = bruto
        .map((b) => rec(b))
        .map((b) => ({
          texto: String(b["texto"] ?? "").slice(0, 24),
          queueId: String(b["queueId"] ?? ""),
        }))
        .filter((b) => b.texto && b.queueId)
        .slice(0, MAX_BOTOES);
    }
  } catch {
    botoes = [];
  }
  return {
    ativo: (mapa.get(CHAVES.ativo) ?? "") === "1",
    titulo: mapa.get(CHAVES.titulo) || PADRAO.titulo,
    descricao: mapa.get(CHAVES.descricao) || PADRAO.descricao,
    rodape: mapa.get(CHAVES.rodape) || PADRAO.rodape,
    botoes,
  };
}

/** Envia o menu de botões para um contato (número ou JID completo). */
export async function enviarMenu(
  destino: string,
  menu?: MenuConfig,
): Promise<{ ok: boolean; erro?: string }> {
  const cfgMenu = menu ?? (await lerMenu());
  if (cfgMenu.botoes.length === 0) return { ok: false, erro: "Nenhum botão configurado." };
  const { lerConfigResolvida, evolutionFetch } = await import("@/lib/evolution-go.functions");
  const cfg = await lerConfigResolvida();
  if (!cfg.baseUrl) return { ok: false, erro: "Evolution Go não configurado." };

  // Contatos comuns viram número puro; grupos (@g.us) e anônimos (@lid)
  // precisam do identificador completo.
  const ehJidEspecial = destino.endsWith("@g.us") || destino.endsWith("@lid");
  const number = ehJidEspecial ? destino : destino.replace(/@.*$/, "").replace(/\D/g, "");
  if (!number) return { ok: false, erro: "Destinatário inválido." };

  try {
    const { status, corpo } = await evolutionFetch(cfg, "/send/button", {
      method: "POST",
      body: JSON.stringify({
        number,
        ...(ehJidEspecial ? { formatJid: false } : {}),
        title: cfgMenu.titulo,
        description: cfgMenu.descricao,
        footer: cfgMenu.rodape,
        buttons: cfgMenu.botoes.map((b) => ({
          type: "reply",
          displayText: b.texto,
          id: `fila:${b.queueId}`,
        })),
      }),
    });
    if (status >= 400) {
      const c = rec(corpo);
      const msg = rec(c["error"])["message"] ?? c["message"];
      return {
        ok: false,
        erro: typeof msg === "string" && msg ? msg : `Erro ${status} ao enviar o menu.`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Id de fila contido na resposta de um botão (`fila:<uuid>`), se houver. */
export function filaDoBotao(selecionado: string): string | null {
  const id = selecionado.trim();
  if (!id.startsWith("fila:")) return null;
  const queueId = id.slice(5).trim();
  return queueId || null;
}

async function ehAdmin(context: unknown): Promise<boolean> {
  const ctx = context as { supabase: any; userId: string };
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  return data === true;
}

/** Configuração atual do menu + filas disponíveis. */
export const whatsappMenuObter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      ok: boolean;
      menu: MenuConfig;
      filas: Array<{ id: string; nome: string; ativa: boolean }>;
      erro?: string;
    }> => {
      if (!(await ehAdmin(context)))
        return { ok: false, menu: PADRAO, filas: [], erro: "Apenas administradores." };
      const menu = await lerMenu();
      const { data } = await context.supabase
        .from("chat_queues")
        .select("id, name, active")
        .order("name");
      const filas = ((data ?? []) as Array<{ id: string; name: string; active: boolean }>).map(
        (f) => ({ id: f.id, nome: f.name, ativa: f.active }),
      );
      return { ok: true, menu, filas };
    },
  );

/** Salva o menu de botões (somente admin). */
export const whatsappMenuSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MenuConfig) => {
    const botoes = (Array.isArray(input?.botoes) ? input.botoes : [])
      .map((b) => ({
        texto: String(b?.texto ?? "").trim().slice(0, 24),
        queueId: String(b?.queueId ?? "").trim(),
      }))
      .filter((b) => b.texto && b.queueId)
      .slice(0, MAX_BOTOES);
    return {
      ativo: input?.ativo === true,
      titulo: String(input?.titulo ?? "").trim().slice(0, 60) || PADRAO.titulo,
      descricao: String(input?.descricao ?? "").trim().slice(0, 500) || PADRAO.descricao,
      rodape: String(input?.rodape ?? "").trim().slice(0, 60) || PADRAO.rodape,
      botoes,
    } satisfies MenuConfig;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    if (!(await ehAdmin(context))) return { ok: false, erro: "Apenas administradores." };
    if (data.ativo && data.botoes.length === 0)
      return { ok: false, erro: "Adicione pelo menos um botão com a fila de destino." };
    try {
      await salvarChave(CHAVES.ativo, data.ativo ? "1" : "0");
      await salvarChave(CHAVES.titulo, data.titulo);
      await salvarChave(CHAVES.descricao, data.descricao);
      await salvarChave(CHAVES.rodape, data.rodape);
      await salvarChave(CHAVES.botoes, JSON.stringify(data.botoes));
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

/** Envia o menu para um número de teste (somente admin). */
export const whatsappMenuEnviarTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { numero: string }) => {
    const numero = String(input?.numero ?? "").replace(/\D/g, "");
    if (!numero) throw new Error("Informe o número do destinatário.");
    return { numero };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    if (!(await ehAdmin(context))) return { ok: false, erro: "Apenas administradores." };
    return enviarMenu(data.numero);
  });
