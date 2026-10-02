import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Conexão do RH com o Evolution Go para publicar vagas em grupos do WhatsApp.
 * Usa o mesmo servidor configurado no admin, mas o RH escolhe a própria
 * instância (número) e os grupos de destino.
 */

const K = { instancia: "rh_evolution_instancia", grupos: "rh_whatsapp_grupos" } as const;

export type RhGrupo = { jid: string; nome: string };
export type RhInstancia = { nome: string; conectada: boolean };

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

async function guard(context: unknown) {
  const { assertAprovadorVagas } = await import("@/lib/vagas-guard.server");
  await assertAprovadorVagas(context as never);
}

async function lerChave(chave: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_config" as never)
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  return String((data as { valor?: string } | null)?.valor ?? "").trim();
}

async function salvarChave(chave: string, valor: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_config" as never)
    .upsert({ chave, valor, updated_at: new Date().toISOString() } as never, {
      onConflict: "chave",
    } as never);
}

async function instanciasBrutas() {
  const { lerConfig, evolutionFetch } = await import("@/lib/evolution-go.functions");
  const cfg = await lerConfig();
  if (!cfg.baseUrl || !cfg.apiKey)
    throw new Error("Servidor Evolution não configurado no painel admin.");
  const { status, corpo } = await evolutionFetch({ ...cfg, token: "" }, "/instance/all");
  if (status >= 400) throw new Error(`Erro ${status} ao listar instâncias do Evolution.`);
  const bruto = rec(corpo)["data"] ?? rec(corpo)["instances"] ?? corpo;
  const lista = (Array.isArray(bruto) ? bruto.map(rec) : []).map((o) => ({
    nome: String(o["name"] ?? o["Name"] ?? "").trim(),
    token: String(o["token"] ?? o["Token"] ?? "").trim(),
    conectada: o["connected"] === true || o["Connected"] === true,
  }));
  return { cfg, lista, evolutionFetch };
}

/** Config da instância do RH (token resolvido pelo nome). */
async function cfgRh() {
  const { cfg, lista, evolutionFetch } = await instanciasBrutas();
  const nome = (await lerChave(K.instancia)) || cfg.instancia;
  const alvo = lista.find((i) => i.nome.toLowerCase() === nome.toLowerCase());
  if (!alvo) throw new Error("Escolha a instância do WhatsApp do RH.");
  if (!alvo.conectada) throw new Error(`A instância "${alvo.nome}" não está conectada ao WhatsApp.`);
  return { cfg: { ...cfg, token: alvo.token, instancia: alvo.nome }, evolutionFetch };
}

export const rhWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    try {
      const { cfg, lista } = await instanciasBrutas();
      const escolhida = (await lerChave(K.instancia)) || cfg.instancia;
      let grupos: RhGrupo[] = [];
      try {
        grupos = JSON.parse((await lerChave(K.grupos)) || "[]");
      } catch {
        grupos = [];
      }
      return {
        ok: true as const,
        instancias: lista.map((i) => ({ nome: i.nome, conectada: i.conectada })) as RhInstancia[],
        instancia: escolhida,
        grupos,
      };
    } catch (e) {
      return {
        ok: false as const,
        erro: e instanceof Error ? e.message : String(e),
        instancias: [] as RhInstancia[],
        instancia: "",
        grupos: [] as RhGrupo[],
      };
    }
  });

export const rhWhatsappSelecionarInstancia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { nome: string }) => ({ nome: String(i?.nome ?? "").trim().slice(0, 120) }))
  .handler(async ({ data, context }) => {
    await guard(context);
    await salvarChave(K.instancia, data.nome);
    return { ok: true };
  });

export const rhWhatsappListarGrupos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; grupos: RhGrupo[]; erro?: string }> => {
    await guard(context);
    try {
      const { cfg, evolutionFetch } = await cfgRh();
      for (const path of ["/group/list", "/group/myall", "/group/fetchAllGroups"]) {
        const { status, corpo } = await evolutionFetch(cfg, path);
        if (status >= 400) continue;
        const bruto = rec(corpo)["data"] ?? rec(corpo)["groups"] ?? corpo;
        const lista = Array.isArray(bruto) ? bruto.map(rec) : [];
        const grupos = lista
          .map((g) => ({
            jid: String(g["JID"] ?? g["jid"] ?? g["id"] ?? g["groupJid"] ?? "").trim(),
            nome: String(g["Name"] ?? g["name"] ?? g["subject"] ?? g["Subject"] ?? "").trim(),
          }))
          .filter((g) => g.jid.includes("@g.us"))
          .map((g) => ({ ...g, nome: g.nome || g.jid }))
          .sort((a, b) => a.nome.localeCompare(b.nome));
        return { ok: true, grupos };
      }
      return { ok: false, grupos: [], erro: "O servidor Evolution não retornou os grupos." };
    } catch (e) {
      return { ok: false, grupos: [], erro: e instanceof Error ? e.message : String(e) };
    }
  });

export const rhWhatsappSalvarGrupos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { grupos: RhGrupo[] }) => ({
    grupos: (Array.isArray(i?.grupos) ? i.grupos : [])
      .slice(0, 100)
      .map((g) => ({ jid: String(g.jid).slice(0, 120), nome: String(g.nome).slice(0, 200) }))
      .filter((g) => g.jid.endsWith("@g.us")),
  }))
  .handler(async ({ data, context }) => {
    await guard(context);
    await salvarChave(K.grupos, JSON.stringify(data.grupos));
    return { ok: true };
  });

export const rhPublicarVagaGrupos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { texto: string; jids: string[] }) => {
    const texto = String(i?.texto ?? "").trim();
    if (!texto) throw new Error("Mensagem vazia.");
    if (texto.length > 4000) throw new Error("Mensagem muito longa.");
    const jids = (Array.isArray(i?.jids) ? i.jids : [])
      .map((j) => String(j).trim())
      .filter((j) => j.endsWith("@g.us"))
      .slice(0, 50);
    if (jids.length === 0) throw new Error("Selecione ao menos um grupo.");
    return { texto, jids };
  })
  .handler(async ({ data, context }) => {
    await guard(context);
    const { cfg, evolutionFetch } = await cfgRh();
    const resultados: Array<{ jid: string; ok: boolean; erro?: string }> = [];
    for (const jid of data.jids) {
      try {
        const { status, corpo } = await evolutionFetch(cfg, "/send/text", {
          method: "POST",
          body: JSON.stringify({ number: jid, text: data.texto }),
        });
        const msg = rec(rec(corpo)["error"])["message"] ?? rec(corpo)["message"];
        resultados.push(
          status >= 400
            ? { jid, ok: false, erro: typeof msg === "string" ? msg : `Erro ${status}` }
            : { jid, ok: true },
        );
      } catch (e) {
        resultados.push({ jid, ok: false, erro: e instanceof Error ? e.message : String(e) });
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    return { enviados: resultados.filter((r) => r.ok).length, resultados };
  });
