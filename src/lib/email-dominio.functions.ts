import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Domínio padrão de envio, usado enquanto ninguém alterar manualmente. */
export const DOMINIO_EMAIL = "notify.email.operacional.cloud";
export const DOMINIO_RAIZ = "email.operacional.cloud";
export const REMETENTE = `noreply@${DOMINIO_EMAIL}`;
export const TOKEN_PADRAO =
  "lovable_email_verify=ab42bff5ab61eedef0b01cd0192e9ce9b6d6862278e5c8c67198b8b2fda3dfbd";

export const CHAVE_DOMINIO_EMAIL = "email_dominio_envio";
export const CHAVE_TOKEN_EMAIL = "email_token_verificacao";

export interface RegistroDnsEsperado {
  tipo: "TXT" | "NS";
  host: string;
  valor: string;
}

/** Raiz do domínio de envio (remove o primeiro rótulo, ex.: notify.). */
function raizDe(dominio: string): string {
  const partes = dominio.split(".");
  return partes.length > 2 ? partes.slice(1).join(".") : dominio;
}

export function registrosEsperados(dominio: string, token: string): RegistroDnsEsperado[] {
  return [
    { tipo: "TXT", host: `_lovable-email.${raizDe(dominio)}`, valor: token },
    { tipo: "NS", host: dominio, valor: "ns5.lovable.cloud" },
    { tipo: "NS", host: dominio, valor: "ns6.lovable.cloud" },
  ];
}

export const REGISTROS_ESPERADOS: RegistroDnsEsperado[] = registrosEsperados(
  DOMINIO_EMAIL,
  TOKEN_PADRAO,
);

export interface ResultadoRegistro extends RegistroDnsEsperado {
  encontrado: boolean;
  observado: string[];
}

function dominioValido(valor: string) {
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(valor);
}

async function consultar(nome: string, tipo: "TXT" | "NS"): Promise<string[]> {
  try {
    const resposta = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(nome)}&type=${tipo}`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!resposta.ok) return [];
    const json = (await resposta.json()) as { Answer?: { data?: string }[] };
    return (json.Answer ?? [])
      .map((r) =>
        String(r.data ?? "")
          .replace(/^"|"$/g, "")
          .replace(/\.$/, "")
          .toLowerCase(),
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function lerConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_config")
    .select("chave,valor")
    .in("chave", [CHAVE_DOMINIO_EMAIL, CHAVE_TOKEN_EMAIL]);
  const mapa = new Map((data ?? []).map((r) => [r.chave, String(r.valor ?? "").trim()]));
  const dominio = mapa.get(CHAVE_DOMINIO_EMAIL) || DOMINIO_EMAIL;
  const token = mapa.get(CHAVE_TOKEN_EMAIL) || TOKEN_PADRAO;
  return { dominio, token, personalizado: !!mapa.get(CHAVE_DOMINIO_EMAIL) };
}

/** Lê o domínio de envio configurado. */
export const obterDominioEmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => lerConfig());

/** Salva manualmente o domínio de envio e o código de verificação. */
export const salvarDominioEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { dominio: string; token?: string }) => {
    const dominio = String(input?.dominio ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/\.$/, "");
    if (!dominioValido(dominio))
      throw new Error("Informe um domínio válido, como email.suaempresa.com.br.");
    const token = String(input?.token ?? "").trim();
    if (token.length > 300) throw new Error("Código de verificação muito longo.");
    return { dominio, token };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const agora = new Date().toISOString();
    const linhas = [{ chave: CHAVE_DOMINIO_EMAIL, valor: data.dominio, updated_at: agora }];
    if (data.token) linhas.push({ chave: CHAVE_TOKEN_EMAIL, valor: data.token, updated_at: agora });
    const { error } = await context.supabase
      .from("app_config")
      .upsert(linhas, { onConflict: "chave" });
    if (error) throw new Error("Sem permissão para alterar esta configuração.");
    return { dominio: data.dominio };
  });

/** Volta para o domínio padrão do sistema. */
export const restaurarDominioEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("app_config")
      .delete()
      .in("chave", [CHAVE_DOMINIO_EMAIL, CHAVE_TOKEN_EMAIL]);
    if (error) throw new Error("Sem permissão para alterar esta configuração.");
    return { dominio: DOMINIO_EMAIL };
  });

/** Confere no DNS público se os registros do domínio de e-mail já estão publicados. */
export const verificarDominioEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { dominio, token, personalizado } = await lerConfig();
    const esperados = registrosEsperados(dominio, token);
    const registros: ResultadoRegistro[] = [];
    for (const esperado of esperados) {
      const observado = await consultar(esperado.host, esperado.tipo);
      registros.push({
        ...esperado,
        observado,
        encontrado: observado.some((v) => v.includes(esperado.valor.toLowerCase())),
      });
    }
    const completos = registros.every((r) => r.encontrado);
    return {
      dominio,
      personalizado,
      remetente: `noreply@${dominio}`,
      registros,
      situacao: completos ? ("publicado" as const) : ("pendente" as const),
      verificadoEm: new Date().toISOString(),
    };
  });
