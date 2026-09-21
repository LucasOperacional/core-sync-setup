import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração com o Evolution Go (API WhatsApp em Go).
 * Documentação de referência salva em `docs/evolution-go/`.
 * Endpoints usados: GET /instance/status, GET /instance/qr, GET /instance/all,
 * POST /send/text. Autenticação pelo header `apikey`.
 */

export type EvolutionGoConfig = {
  baseUrl: string;
  instancia: string;
  apiKeyDefinida: boolean;
  tokenDefinido: boolean;
  webhookUrl: string;
};


export type EvolutionGoStatus = {
  ok: boolean;
  configurado: boolean;
  conectado: boolean;
  logado: boolean;
  nome?: string | null;
  qrCode?: string | null;
  erro?: string;
};

const CHAVES = {
  baseUrl: "evolution_go_base_url",
  apiKey: "evolution_go_api_key",
  token: "evolution_go_instance_token",
  instancia: "evolution_go_instancia",
  instanceId: "evolution_go_instance_id",
  webhookUrl: "evolution_go_webhook_url",
  qrCode: "evolution_go_qrcode",
  qrCodeEm: "evolution_go_qrcode_em",
} as const;

type Cfg = {
  baseUrl: string;
  apiKey: string;
  token: string;
  instancia: string;
  instanceId: string;
  webhookUrl: string;
};

export async function lerConfig(): Promise<Cfg> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_config" as never)
    .select("chave, valor")
    .in("chave", Object.values(CHAVES));
  const mapa = new Map<string, string>();
  for (const linha of (data ?? []) as Array<{ chave: string; valor: string | null }>) {
    if (linha?.chave) mapa.set(linha.chave, linha.valor ?? "");
  }
  return {
    baseUrl: (mapa.get(CHAVES.baseUrl) ?? "").trim().replace(/\/+$/, ""),
    apiKey: (mapa.get(CHAVES.apiKey) ?? "").trim(),
    token: (mapa.get(CHAVES.token) ?? "").trim(),
    instancia: (mapa.get(CHAVES.instancia) ?? "").trim(),
    instanceId: (mapa.get(CHAVES.instanceId) ?? "").trim(),
    webhookUrl: (mapa.get(CHAVES.webhookUrl) ?? "").trim(),
  };
}


async function salvarChave(chave: string, valor: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_config" as never)
    .upsert({ chave, valor, updated_at: new Date().toISOString() } as never, {
      onConflict: "chave",
    } as never);
}

/** Guarda (ou limpa) o QR Code recebido pelo webhook do Evolution Go. */
export async function guardarQrCode(imagem: string): Promise<void> {
  await salvarChave(CHAVES.qrCode, imagem);
  await salvarChave(CHAVES.qrCodeEm, imagem ? new Date().toISOString() : "");
}

/** Último QR Code recebido pelo webhook, válido por 2 minutos. */
async function lerQrCodeSalvo(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_config" as never)
    .select("chave, valor")
    .in("chave", [CHAVES.qrCode, CHAVES.qrCodeEm]);
  const mapa = new Map<string, string>();
  for (const l of (data ?? []) as Array<{ chave: string; valor: string | null }>) {
    mapa.set(l.chave, l.valor ?? "");
  }
  const img = (mapa.get(CHAVES.qrCode) ?? "").trim();
  const em = Date.parse(mapa.get(CHAVES.qrCodeEm) ?? "");
  if (!img || Number.isNaN(em)) return null;
  return Date.now() - em < 120_000 ? img : null;
}



async function ehAdmin(context: unknown): Promise<boolean> {
  const ctx = context as { supabase: any; userId: string };
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  return data === true;
}

/** Chamada autenticada à API do Evolution Go. */
export async function evolutionFetch(
  cfg: Cfg,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; corpo: unknown }> {
  if (!cfg.baseUrl) throw new Error("Evolution Go não configurado.");
  const chave = cfg.token || cfg.apiKey;
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      ...(chave ? { apikey: chave } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  return { status: res.status, corpo };
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Os endpoints da instância (/instance/status, /send/text) exigem o token da
 * própria instância no header `apikey` — a chave global só vale para
 * /instance/all. Quando só a chave global foi informada, descobrimos o token
 * da instância pelo nome e guardamos para as próximas chamadas.
 */
export async function lerConfigResolvida(): Promise<Cfg> {
  const cfg = await lerConfig();
  if ((cfg.token && cfg.instanceId) || !cfg.baseUrl || !cfg.apiKey) return cfg;
  try {
    const { status, corpo } = await evolutionFetch({ ...cfg, token: "" }, "/instance/all");
    if (status >= 400) return cfg;
    const bruto = rec(corpo)["data"] ?? rec(corpo)["instances"] ?? corpo;
    const lista = Array.isArray(bruto) ? bruto.map(rec) : [];
    const alvo = cfg.instancia
      ? lista.find(
          (o) =>
            String(o["name"] ?? o["Name"] ?? "").toLowerCase() === cfg.instancia.toLowerCase(),
        )
      : lista[0];
    if (!alvo) return cfg;
    const token = String(alvo["token"] ?? alvo["Token"] ?? "").trim() || cfg.token;
    const instanceId = String(
      alvo["id"] ?? alvo["ID"] ?? alvo["instanceId"] ?? alvo["InstanceId"] ?? "",
    ).trim();
    const nome = String(alvo["name"] ?? alvo["Name"] ?? "").trim() || cfg.instancia;
    if (token && token !== cfg.token) await salvarChave(CHAVES.token, token);
    if (instanceId && instanceId !== cfg.instanceId)
      await salvarChave(CHAVES.instanceId, instanceId);
    if (nome && nome !== cfg.instancia) await salvarChave(CHAVES.instancia, nome);
    return { ...cfg, token, instanceId: instanceId || cfg.instanceId, instancia: nome };
  } catch {
    return cfg;
  }
}


function mensagemErro(status: number, corpo: unknown): string {
  const c = rec(corpo);
  const erro = rec(c["error"]);
  const msg = erro["message"] ?? c["message"] ?? c["error"];
  if (typeof msg === "string" && msg.trim()) return msg;
  if (status === 401)
    return "Não autorizado: confira a chave global e o nome da instância no Evolution Go.";
  if (status === 404) return "Instância não encontrada no Evolution Go.";
  if (status === 530)
    return "Erro 530 (Cloudflare/Hospedagem): O acesso foi bloqueado por proteção antibot ou o DNS do servidor falhou.";
  return `Erro ${status} na API do Evolution Go.`;
}

/** Configuração atual (sem expor as chaves). */
export const evolutionGoObterConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvolutionGoConfig & { ok: boolean; erro?: string }> => {
    if (!(await ehAdmin(context))) {
      return {
        ok: false,
        baseUrl: "",
        instancia: "",
        apiKeyDefinida: false,
        tokenDefinido: false,
        webhookUrl: "",
        erro: "Apenas administradores podem ver esta configuração.",
      };
    }
    const cfg = await lerConfig();
    return {
      ok: true,
      baseUrl: cfg.baseUrl,
      instancia: cfg.instancia,
      apiKeyDefinida: Boolean(cfg.apiKey),
      tokenDefinido: Boolean(cfg.token),
      webhookUrl: cfg.webhookUrl,
    };
  });


/** Salva a configuração do Evolution Go (somente admin). Campos vazios não são alterados. */
export const evolutionGoSalvarConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { baseUrl?: string; apiKey?: string; token?: string; instancia?: string }) => ({
      baseUrl: String(input?.baseUrl ?? "").trim(),
      apiKey: String(input?.apiKey ?? "").trim(),
      token: String(input?.token ?? "").trim(),
      instancia: String(input?.instancia ?? "").trim(),
    }),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    if (!(await ehAdmin(context)))
      return { ok: false, erro: "Apenas administradores podem alterar esta configuração." };
    if (data.baseUrl && !/^https?:\/\//i.test(data.baseUrl))
      return { ok: false, erro: "A URL deve começar com http:// ou https://" };
    try {
      if (data.baseUrl) await salvarChave(CHAVES.baseUrl, data.baseUrl.replace(/\/+$/, ""));
      if (data.apiKey) await salvarChave(CHAVES.apiKey, data.apiKey);
      if (data.token) await salvarChave(CHAVES.token, data.token);
      await salvarChave(CHAVES.instancia, data.instancia);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

/** Remove as credenciais salvas (somente admin). */
export const evolutionGoLimparConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; erro?: string }> => {
    if (!(await ehAdmin(context)))
      return { ok: false, erro: "Apenas administradores podem alterar esta configuração." };
    for (const chave of Object.values(CHAVES)) await salvarChave(chave, "");
    return { ok: true };
  });

/** Estado da instância + QR Code quando não estiver logada. */
export const evolutionGoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<EvolutionGoStatus> => {
    const cfg = await lerConfigResolvida();
    if (!cfg.baseUrl)
      return { ok: false, configurado: false, conectado: false, logado: false };
    try {
      const { status, corpo } = await evolutionFetch(cfg, "/instance/status");
      if (status >= 400)
        return {
          ok: false,
          configurado: true,
          conectado: false,
          logado: false,
          erro: mensagemErro(status, corpo),
        };
      const d = rec(rec(corpo)["data"] ?? corpo);
      const conectado = d["Connected"] === true || d["connected"] === true;
      const logado = d["LoggedIn"] === true || d["loggedIn"] === true;
      const nome = typeof d["Name"] === "string" ? (d["Name"] as string) : null;

      let qrCode: string | null = null;
      if (!logado) {
        const lerQr = async (): Promise<string | null> => {
          const qr = await evolutionFetch(cfg, "/instance/qr");
          if (qr.status >= 400) return null;
          const q = rec(rec(qr.corpo)["data"] ?? qr.corpo);
          const img = q["Qrcode"] ?? q["qrcode"] ?? q["QRCode"];
          return typeof img === "string" && img ? img : null;
        };

        qrCode = (await lerQr()) ?? (await lerQrCodeSalvo());

        // O QR Code só é gerado depois que a sessão é iniciada no servidor e,
        // na prática, chega pelo webhook (o GET /instance/qr costuma responder
        // "no QR code available"). Iniciamos a sessão e aguardamos o webhook.
        if (!qrCode) {
          await evolutionFetch(cfg, "/instance/connect", {
            method: "POST",
            ...(cfg.instanceId ? { headers: { instanceId: cfg.instanceId } } : {}),
            body: JSON.stringify({
              immediate: true,
              subscribe: ["MESSAGE", "SEND_MESSAGE", "CONNECTION", "QRCODE"],
              ...(cfg.webhookUrl ? { webhookUrl: cfg.webhookUrl } : {}),
            }),
          });
          for (let i = 0; i < 8 && !qrCode; i += 1) {
            await new Promise((r) => setTimeout(r, 1500));
            qrCode = (await lerQr()) ?? (await lerQrCodeSalvo());
          }
        }
      }
      return { ok: true, configurado: true, conectado, logado, nome, qrCode };
    } catch (e) {
      return {
        ok: false,
        configurado: true,
        conectado: false,
        logado: false,
        erro: e instanceof Error ? e.message : String(e),
      };
    }
  });

/** Lista as instâncias cadastradas no servidor (usa a chave global). */
export const evolutionGoInstancias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ ok: boolean; instancias: Array<{ nome: string; conectada: boolean }>; erro?: string }> => {
      if (!(await ehAdmin(context)))
        return { ok: false, instancias: [], erro: "Apenas administradores." };
      const cfg = await lerConfig();
      if (!cfg.baseUrl) return { ok: false, instancias: [], erro: "Evolution Go não configurado." };
      try {
        const { status, corpo } = await evolutionFetch(
          { ...cfg, token: "" },
          "/instance/all",
        );
        if (status >= 400)
          return { ok: false, instancias: [], erro: mensagemErro(status, corpo) };
        const bruto = rec(corpo)["data"] ?? rec(corpo)["instances"] ?? corpo;
        const lista = Array.isArray(bruto) ? bruto : [];
        return {
          ok: true,
          instancias: lista.map((i) => {
            const o = rec(i);
            return {
              nome: String(o["name"] ?? o["Name"] ?? o["instance"] ?? ""),
              conectada: o["connected"] === true || o["Connected"] === true,
            };
          }),
        };
      } catch (e) {
        return { ok: false, instancias: [], erro: e instanceof Error ? e.message : String(e) };
      }
    },
  );

export type InstanciaEvolution = {
  nome: string;
  id: string;
  conectada: boolean;
  ativa: boolean;
};

/** Lê a lista completa de instâncias do servidor (usa a chave global). */
async function listarInstanciasBrutas(cfg: Cfg): Promise<Array<Record<string, unknown>>> {
  const { status, corpo } = await evolutionFetch({ ...cfg, token: "" }, "/instance/all");
  if (status >= 400) throw new Error(mensagemErro(status, corpo));
  const bruto = rec(corpo)["data"] ?? rec(corpo)["instances"] ?? corpo;
  return Array.isArray(bruto) ? bruto.map(rec) : [];
}

function dadosInstancia(o: Record<string, unknown>) {
  return {
    nome: String(o["name"] ?? o["Name"] ?? o["instance"] ?? "").trim(),
    id: String(o["id"] ?? o["ID"] ?? o["instanceId"] ?? o["InstanceId"] ?? "").trim(),
    token: String(o["token"] ?? o["Token"] ?? "").trim(),
    conectada: o["connected"] === true || o["Connected"] === true,
  };
}

/** Lista as instâncias do servidor com id, conexão e qual está em uso. */
export const evolutionGoListarInstancias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ ok: boolean; instancias: InstanciaEvolution[]; erro?: string }> => {
      if (!(await ehAdmin(context)))
        return { ok: false, instancias: [], erro: "Apenas administradores." };
      const cfg = await lerConfig();
      if (!cfg.baseUrl || !cfg.apiKey)
        return { ok: false, instancias: [], erro: "Configure a URL e a chave global primeiro." };
      try {
        const lista = await listarInstanciasBrutas(cfg);
        return {
          ok: true,
          instancias: lista.map((o) => {
            const d = dadosInstancia(o);
            return {
              nome: d.nome,
              id: d.id,
              conectada: d.conectada,
              ativa: Boolean(cfg.instancia) && d.nome.toLowerCase() === cfg.instancia.toLowerCase(),
            };
          }),
        };
      } catch (e) {
        return { ok: false, instancias: [], erro: e instanceof Error ? e.message : String(e) };
      }
    },
  );

/** Define qual instância o sistema vai usar (guarda nome, id e token). */
export const evolutionGoSelecionarInstancia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nome: string }) => {
    const nome = String(input?.nome ?? "").trim();
    if (!nome) throw new Error("Informe a instância.");
    return { nome };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    if (!(await ehAdmin(context))) return { ok: false, erro: "Apenas administradores." };
    const cfg = await lerConfig();
    if (!cfg.baseUrl || !cfg.apiKey) return { ok: false, erro: "Evolution Go não configurado." };
    try {
      const lista = await listarInstanciasBrutas(cfg);
      const alvo = lista
        .map(dadosInstancia)
        .find((d) => d.nome.toLowerCase() === data.nome.toLowerCase());
      if (!alvo) return { ok: false, erro: "Instância não encontrada no servidor." };
      await salvarChave(CHAVES.instancia, alvo.nome);
      await salvarChave(CHAVES.instanceId, alvo.id);
      await salvarChave(CHAVES.token, alvo.token);
      await guardarQrCode("");
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Cria várias instâncias de uma vez (POST /instance/create com a chave global).
 * Depois de criar, busca o id e o token de cada uma, registra o recebedor de
 * mensagens e deixa a primeira instância nova pronta para uso.
 */
export const evolutionGoCriarInstancias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prefixo: string; quantidade: number; webhookUrl?: string }) => {
    const prefixo = String(input?.prefixo ?? "").trim();
    const quantidade = Math.min(20, Math.max(1, Number(input?.quantidade ?? 1) || 1));
    if (!/^[\w.-]{2,40}$/.test(prefixo))
      throw new Error("Use um nome simples (letras, números, - ou _).");
    return { prefixo, quantidade, webhookUrl: String(input?.webhookUrl ?? "").trim() };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: boolean;
      criadas: Array<{ nome: string; id: string; configurada: boolean; erro?: string }>;
      erro?: string;
    }> => {
      if (!(await ehAdmin(context))) return { ok: false, criadas: [], erro: "Apenas administradores." };
      const cfg = await lerConfig();
      if (!cfg.baseUrl || !cfg.apiKey)
        return { ok: false, criadas: [], erro: "Configure a URL e a chave global primeiro." };

      const webhookUrl = data.webhookUrl || cfg.webhookUrl;
      const criadas: Array<{ nome: string; id: string; configurada: boolean; erro?: string }> = [];
      try {
        const existentes = new Set(
          (await listarInstanciasBrutas(cfg)).map((o) => dadosInstancia(o).nome.toLowerCase()),
        );

        let sufixo = 1;
        for (let i = 0; i < data.quantidade; i += 1) {
          let nome = data.quantidade === 1 && !existentes.has(data.prefixo.toLowerCase())
            ? data.prefixo
            : `${data.prefixo}-${sufixo}`;
          while (existentes.has(nome.toLowerCase())) {
            sufixo += 1;
            nome = `${data.prefixo}-${sufixo}`;
          }
          existentes.add(nome.toLowerCase());
          sufixo += 1;

          const { status, corpo } = await evolutionFetch(
            { ...cfg, token: "" },
            "/instance/create",
            { method: "POST", body: JSON.stringify({ name: nome }) },
          );
          if (status >= 400) {
            criadas.push({ nome, id: "", configurada: false, erro: mensagemErro(status, corpo) });
            continue;
          }
          const d = dadosInstancia(rec(rec(corpo)["data"] ?? corpo));
          let { id, token } = d;

          // Alguns servidores não devolvem id/token na criação: buscamos na lista.
          if (!id || !token) {
            const achado = (await listarInstanciasBrutas(cfg))
              .map(dadosInstancia)
              .find((x) => x.nome.toLowerCase() === nome.toLowerCase());
            if (achado) {
              id = id || achado.id;
              token = token || achado.token;
            }
          }

          let configurada = false;
          let erro: string | undefined;
          if (id && token && webhookUrl) {
            const conn = await evolutionFetch(
              { ...cfg, token },
              "/instance/connect",
              {
                method: "POST",
                headers: { instanceId: id },
                body: JSON.stringify({
                  webhookUrl,
                  subscribe: ["MESSAGE", "SEND_MESSAGE", "CONNECTION", "QRCODE"],
                  immediate: true,
                }),
              },
            );
            configurada = conn.status < 400;
            if (!configurada) erro = mensagemErro(conn.status, conn.corpo);
          }
          criadas.push({ nome, id, configurada, ...(erro ? { erro } : {}) });
        }

        // Se ainda não havia instância em uso, ativa a primeira criada com id.
        const primeira = criadas.find((c) => c.id);
        if (primeira && !cfg.instancia) {
          const achado = (await listarInstanciasBrutas(cfg))
            .map(dadosInstancia)
            .find((x) => x.nome.toLowerCase() === primeira.nome.toLowerCase());
          if (achado) {
            await salvarChave(CHAVES.instancia, achado.nome);
            await salvarChave(CHAVES.instanceId, achado.id);
            await salvarChave(CHAVES.token, achado.token);
          }
        }
        if (webhookUrl && webhookUrl !== cfg.webhookUrl)
          await salvarChave(CHAVES.webhookUrl, webhookUrl);

        return { ok: true, criadas };
      } catch (e) {
        return { ok: false, criadas, erro: e instanceof Error ? e.message : String(e) };
      }
    },
  );

export async function enviarMensagemEvolution(
  numero: string,
  texto: string,
): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const destino = String(numero ?? "").replace(/\D/g, "");
  const mensagem = String(texto ?? "").trim();
  if (!destino) return { ok: false, erro: "Informe o número do destinatário." };
  if (!mensagem) return { ok: false, erro: "Mensagem vazia." };
  if (mensagem.length > 4000) return { ok: false, erro: "Mensagem muito longa." };

  const cfg = await lerConfigResolvida();
  if (!cfg.baseUrl) return { ok: false, erro: "Evolution Go não configurado." };
  try {
    const { status, corpo } = await evolutionFetch(cfg, "/send/text", {
      method: "POST",
      body: JSON.stringify({ number: destino, text: mensagem }),
    });
    if (status >= 400) return { ok: false, erro: mensagemErro(status, corpo) };
    const d = rec(rec(corpo)["data"] ?? corpo);
    const info = rec(d["Info"]);
    const id = info["ID"] ?? d["messageId"] ?? d["id"];
    return { ok: true, ...(typeof id === "string" ? { id } : {}) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Envia uma mensagem de texto pelo Evolution Go (POST /send/text). */
export const evolutionGoEnviarTexto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { numero: string; texto: string }) => ({
    numero: String(input?.numero ?? "").replace(/\D/g, ""),
    texto: String(input?.texto ?? "").trim(),
  }))
  .handler(async ({ data }) => enviarMensagemEvolution(data.numero, data.texto));

/**
 * Ativa o recebimento de mensagens: registra a URL do nosso recebedor
 * (`/api/public/evolution-webhook`) na instância do Evolution Go.
 * Documentação: POST /instance/connect com header `instanceId`.
 */
export const evolutionGoAtivarRecebimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { webhookUrl: string }) => {
    const webhookUrl = String(input?.webhookUrl ?? "").trim();
    if (!/^https?:\/\//i.test(webhookUrl)) throw new Error("URL do recebedor inválida.");
    return { webhookUrl };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    if (!(await ehAdmin(context)))
      return { ok: false, erro: "Apenas administradores podem alterar esta configuração." };
    const cfg = await lerConfigResolvida();
    if (!cfg.baseUrl || !cfg.apiKey) return { ok: false, erro: "Evolution Go não configurado." };
    if (!cfg.token)
      return {
        ok: false,
        erro: "Token da instância não encontrado. Clique em \"Testar conexão\" e tente novamente.",
      };
    if (!cfg.instanceId)
      return {
        ok: false,
        erro: "Não foi possível identificar a instância. Confira o nome da instância e salve novamente.",
      };
    try {
      // O endpoint /instance/connect exige o token da própria instância
      // no header `apikey` (a chave global é recusada com "not authorized").
      const { status, corpo } = await evolutionFetch(
        cfg,
        "/instance/connect",
        {
          method: "POST",
          headers: { instanceId: cfg.instanceId },
          body: JSON.stringify({
            webhookUrl: data.webhookUrl,
            subscribe: ["MESSAGE", "SEND_MESSAGE", "CONNECTION", "QRCODE"],
            immediate: true,
          }),
        },
      );
      if (status >= 400) return { ok: false, erro: mensagemErro(status, corpo) };
      await salvarChave(CHAVES.webhookUrl, data.webhookUrl);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });
