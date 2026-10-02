import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DadosEnriquecidos {
  emails: string[];
  telefones: string[];
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  enderecoReceita: string | null;
  emailReceita: string | null;
  telefoneReceita: string | null;
  atividade: string | null;
  socios: string[];
  erro: string | null;
}

const schema = z.object({
  site: z.string().max(500).optional().default(""),
  cnpj: z.string().max(30).optional().default(""),
});

function cnpjValido(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

/** Bloqueia endereços internos para a busca no site ser só em sites públicos. */
function urlPublica(raw: string): URL | null {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (
      h === "localhost" ||
      h.endsWith(".local") ||
      h.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
      h.includes(":") ||
      !h.includes(".")
    )
      return null;
    return u;
  } catch {
    return null;
  }
}

async function baixarTexto(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NXSLeads/1.0)", Accept: "text/html" },
    });
    if (!r.ok) return "";
    const tipo = r.headers.get("content-type") ?? "";
    if (!tipo.includes("html") && !tipo.includes("text")) return "";
    return (await r.text()).slice(0, 600_000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

const IGNORAR_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|example\.|sentry|wixpress|@2x/i;

export const enriquecerLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<DadosEnriquecidos> => {
    const out: DadosEnriquecidos = {
      emails: [], telefones: [], cnpj: null, razaoSocial: null, nomeFantasia: null,
      situacao: null, enderecoReceita: null, emailReceita: null, telefoneReceita: null,
      atividade: null, socios: [], erro: null,
    };
    const emails = new Set<string>();
    const telefones = new Set<string>();
    let cnpj = data.cnpj.replace(/\D/g, "");

    const base = data.site ? urlPublica(data.site) : null;
    if (base) {
      const caminhos = ["", "/contato", "/fale-conosco", "/contact", "/sobre", "/quem-somos"];
      const paginas = await Promise.all(
        caminhos.map((c) => baixarTexto(new URL(c || "/", base.origin).toString())),
      );
      const texto = paginas.join("\n").replace(/&#64;|\[at\]|\(at\)/gi, "@");
      for (const m of texto.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
        const e = m[0].toLowerCase().replace(/\.$/, "");
        if (!IGNORAR_EMAIL.test(e)) emails.add(e);
      }
      const limpo = texto.replace(/<[^>]+>/g, " ");
      for (const m of limpo.matchAll(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g)) {
        const d = m[0].replace(/\D/g, "");
        if (d.length >= 10 && d.length <= 11) telefones.add(m[0].trim());
      }
      for (const m of texto.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)) {
        const c = m[0].replace(/\D/g, "");
        if (!cnpj && cnpjValido(c)) cnpj = c;
      }
    } else if (data.site) {
      out.erro = "Site inválido ou não público.";
    }

    if (cnpj && cnpjValido(cnpj)) {
      out.cnpj = cnpj;
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (r.ok) {
          const j = (await r.json()) as Record<string, unknown>;
          const s = (k: string) => (j[k] ? String(j[k]) : "");
          out.razaoSocial = s("razao_social") || null;
          out.nomeFantasia = s("nome_fantasia") || null;
          out.situacao = s("descricao_situacao_cadastral") || null;
          out.atividade = s("cnae_fiscal_descricao") || null;
          out.emailReceita = s("email").toLowerCase() || null;
          out.telefoneReceita = s("ddd_telefone_1") || null;
          out.enderecoReceita =
            [
              [s("descricao_tipo_de_logradouro"), s("logradouro")].filter(Boolean).join(" "),
              s("numero"), s("complemento"), s("bairro"),
              `${s("municipio")}/${s("uf")}`, s("cep"),
            ].filter((x) => x && x !== "/").join(", ") || null;
          const qsa = Array.isArray(j["qsa"]) ? (j["qsa"] as Record<string, unknown>[]) : [];
          out.socios = qsa.map((q) => String(q["nome_socio"] ?? "")).filter(Boolean);
          if (out.emailReceita) emails.add(out.emailReceita);
        } else if (!out.erro) {
          out.erro = "CNPJ não encontrado na Receita.";
        }
      } catch {
        out.erro = out.erro ?? "Consulta à Receita indisponível agora.";
      }
    } else if (data.cnpj && !out.erro) {
      out.erro = "CNPJ inválido.";
    }

    out.emails = [...emails].slice(0, 10);
    out.telefones = [...telefones].slice(0, 6);
    return out;
  });
