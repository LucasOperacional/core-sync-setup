/**
 * Consulta e atualização das opções (flags) do colaborador na NEXTI.
 *
 * A API da NEXTI expõe, no cadastro de pessoa (/api/persons), um conjunto de
 * campos de liga/desliga. Aqui buscamos o colaborador, lemos o estado atual
 * dessas opções e gravamos as alterações com PUT /api/persons/{id}.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

/** Opções de liga/desliga aceitas pela API da NEXTI no cadastro de pessoa. */
export const FLAGS_NEXTI = [
  { chave: "allowMobileClocking", rotulo: "Permite marcação mobile" },
  { chave: "allowDevicePassword", rotulo: "Permite gerar senha para terminal" },
  { chave: "adminDevice", rotulo: "Administrador do dispositivo" },
  { chave: "ignoreTimeTracking", rotulo: "Ignorar apuração de ponto" },
  { chave: "ignoreValidation", rotulo: "Ignorar validação do cadastro" },
  {
    chave: "generateNightBonusByExpectedWorkload",
    rotulo: "Gerar adicional noturno por jornada prevista",
  },
  { chave: "allowComptimeMobile", rotulo: "Permite banco de horas pelo celular" },
  { chave: "allowMobileMonthComptime", rotulo: "Permite banco de horas mensal pelo celular" },
] as const;

export type ChaveFlagNexti = (typeof FLAGS_NEXTI)[number]["chave"];

export type PessoaFlagsNexti = {
  id: number;
  nome: string;
  matricula: string;
  cpf: string;
  posto: string;
  escala: string;
  flags: Record<string, boolean>;
};

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function lerFlags(registro: Record<string, unknown>): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const f of FLAGS_NEXTI) flags[f.chave] = registro[f.chave] === true;
  return flags;
}

function paraPessoa(registro: Record<string, unknown>): PessoaFlagsNexti | null {
  const id = Number(registro["id"] ?? 0);
  const temDados = ["name", "cpf", "enrolment", "externalId", "companyId"].some(
    (c) => registro[c] !== undefined && registro[c] !== null,
  );
  if (!(id > 0) || !temDados) return null;
  return {
    id,
    nome: String(registro["name"] ?? ""),
    matricula: String(registro["enrolment"] ?? registro["externalId"] ?? ""),
    cpf: soDigitos(registro["cpf"]),
    posto: String(registro["workplaceName"] ?? ""),
    escala: String(registro["nameSchedule"] ?? ""),
    flags: lerFlags(registro),
  };
}

async function config() {
  const bruta = await loadConfig();
  return { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };
}

/** Busca colaboradores na NEXTI por nome, CPF ou matrícula. */
export const buscarPessoasFlagsNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { termo: string }) => {
    const termo = (input?.termo ?? "").trim();
    if (termo.length < 3) throw new Error("Informe ao menos 3 caracteres para buscar.");
    return { termo };
  })
  .handler(async ({ data }): Promise<{ pessoas: PessoaFlagsNexti[] }> => {
    const cfg = await config();
    const res = await requestNexti({
      config: cfg,
      endpoint: "/api/persons/all",
      method: "GET",
      query: { page: 0, size: 50, filter: data.termo },
    });
    const corpo = res.data;
    const lista: unknown[] = Array.isArray(corpo)
      ? corpo
      : isRec(corpo) && Array.isArray(corpo["content"])
        ? (corpo["content"] as unknown[])
        : isRec(corpo) && isRec(corpo["value"]) && Array.isArray(corpo["value"]["content"])
          ? (corpo["value"]["content"] as unknown[])
          : [];
    const pessoas: PessoaFlagsNexti[] = [];
    for (const item of lista) {
      if (!isRec(item)) continue;
      const p = paraPessoa(item);
      if (p) pessoas.push(p);
    }
    return { pessoas };
  });

/** Lê novamente as opções de um colaborador específico. */
export const lerFlagsPessoaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { personId: number }) => {
    const personId = Number(input?.personId ?? 0);
    if (!(personId > 0)) throw new Error("Colaborador inválido.");
    return { personId };
  })
  .handler(async ({ data }): Promise<{ pessoa: PessoaFlagsNexti | null }> => {
    const cfg = await config();
    const res = await requestNexti({
      config: cfg,
      endpoint: `/api/persons/${data.personId}`,
      method: "GET",
    });
    const corpo = res.data;
    const registro = isRec(corpo)
      ? isRec(corpo["value"])
        ? (corpo["value"] as Record<string, unknown>)
        : corpo
      : null;
    return { pessoa: registro ? paraPessoa(registro) : null };
  });

/** Grava as opções escolhidas no cadastro do colaborador na NEXTI. */
export const salvarFlagsPessoaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { personId: number; flags: Record<string, boolean> }) => {
    const personId = Number(input?.personId ?? 0);
    if (!(personId > 0)) throw new Error("Colaborador inválido.");
    const flags: Record<string, boolean> = {};
    for (const f of FLAGS_NEXTI) {
      if (typeof input?.flags?.[f.chave] === "boolean") flags[f.chave] = input.flags[f.chave]!;
    }
    return { personId, flags };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; erro?: string; flags?: Record<string, boolean> }> => {
    const cfg = await config();
    // Lê o cadastro atual para preservar todos os demais campos no PUT.
    const atualRes = await requestNexti({
      config: cfg,
      endpoint: `/api/persons/${data.personId}`,
      method: "GET",
    });
    const corpo = atualRes.data;
    const atual = isRec(corpo)
      ? isRec(corpo["value"])
        ? ({ ...(corpo["value"] as Record<string, unknown>) })
        : { ...corpo }
      : {};
    delete atual["message"];

    const payload: Record<string, unknown> = {
      ...atual,
      ...data.flags,
      id: data.personId,
      ignoreValidation: data.flags["ignoreValidation"] ?? true,
    };

    try {
      const res = await requestNexti({
        config: cfg,
        endpoint: `/api/persons/${data.personId}`,
        method: "PUT",
        body: payload,
      });
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, flags: lerFlags(payload) };
      }
      return { ok: false, erro: `A NEXTI respondeu ${res.status} ao salvar as opções.` };
    } catch (error) {
      return { ok: false, erro: (error as Error)?.message ?? "Não foi possível salvar as opções." };
    }
  });

/** Colaborador retornado na sincronização, com a situação do cadastro. */
export type ColaboradorSincronizado = {
  id: number;
  nome: string;
  matricula: string;
  cpf: string;
  posto: string;
  escala: string;
  ativo: boolean;
  situacao: string;
};

/** Descobre se o cadastro está ativo, olhando os campos usados pela NEXTI. */
function situacaoDoRegistro(r: Record<string, unknown>): { ativo: boolean; situacao: string } {
  const nome = String(
    r["personSituationName"] ?? r["pessoaSituationName"] ?? r["situationName"] ?? r["situation"] ?? "",
  ).trim();
  const idSituacao = Number(r["pessoaSituationId"] ?? r["personSituationId"] ?? r["situationId"] ?? 0);
  const booleano = r["active"] ?? r["isActive"] ?? r["enabled"];

  let ativo: boolean;
  if (typeof booleano === "boolean") ativo = booleano;
  else if (nome) ativo = /ativ/i.test(nome) && !/inativ/i.test(nome);
  else ativo = idSituacao === 1;

  return { ativo, situacao: nome || (ativo ? "Ativo" : "Inativo") };
}

/**
 * Sincroniza todos os colaboradores da NEXTI, percorrendo as páginas do
 * cadastro, para conferir quais estão ativos e quais estão inativos.
 */
export const sincronizarColaboradoresNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{
    colaboradores: ColaboradorSincronizado[];
    total: number;
    ativos: number;
    inativos: number;
    erro?: string;
  }> => {
    const cfg = await config();
    const colaboradores: ColaboradorSincronizado[] = [];
    const vistos = new Set<number>();
    let erro: string | undefined;
    const tamanho = 200;

    try {
      for (let pagina = 0; pagina < 60; pagina++) {
        const res = await requestNexti({
          config: cfg,
          endpoint: "/api/persons/all",
          method: "GET",
          query: { page: pagina, size: tamanho },
        });
        const corpo = res.data;
        const lista: unknown[] = Array.isArray(corpo)
          ? corpo
          : isRec(corpo) && Array.isArray(corpo["content"])
            ? (corpo["content"] as unknown[])
            : isRec(corpo) && isRec(corpo["value"]) && Array.isArray(corpo["value"]["content"])
              ? (corpo["value"]["content"] as unknown[])
              : [];
        if (lista.length === 0) break;

        for (const item of lista) {
          if (!isRec(item)) continue;
          const p = paraPessoa(item);
          if (!p || vistos.has(p.id)) continue;
          vistos.add(p.id);
          const { ativo, situacao } = situacaoDoRegistro(item);
          colaboradores.push({
            id: p.id,
            nome: p.nome,
            matricula: p.matricula,
            cpf: p.cpf,
            posto: p.posto,
            escala: p.escala,
            ativo,
            situacao,
          });
        }
        if (lista.length < tamanho) break;
      }
    } catch (error) {
      erro = (error as Error)?.message ?? "Não foi possível consultar a NEXTI.";
    }

    colaboradores.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const ativos = colaboradores.filter((c) => c.ativo).length;
    return {
      colaboradores,
      total: colaboradores.length,
      ativos,
      inativos: colaboradores.length - ativos,
      ...(erro ? { erro } : {}),
    };
  });
