import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

const movimentacaoSchema = z.object({
  colaborador: z.string().trim().min(1, "Selecione o colaborador."),
  personId: z.string().trim().regex(/^\d+$/, "Colaborador sem identificador válido na NEXTI."),
  personExternalId: z.string().trim().optional().default(""),
  postoAtual: z.string().trim().min(1, "Selecione o posto atual."),
  postoAtualId: z.string().trim().optional().default(""),
  novoPosto: z.string().trim().min(1, "Selecione o novo posto."),
  novoPostoId: z.string().trim().regex(/^\d+$/, "Novo posto sem identificador válido na NEXTI."),
  novoPostoExternalId: z.string().trim().optional().default(""),
  dataMovimentacao: z.string().date("Informe uma data válida."),
  motivo: z.string().trim().min(3, "Informe o motivo da movimentação.").max(2000),
  origemUrl: z.string().trim().url().optional().default(""),
});

const compatibilidadeSchema = z.object({
  personId: z.string().trim().regex(/^\d+$/),
  novoPostoId: z.string().trim().regex(/^\d+$/),
  novoPostoExternalId: z.string().trim().optional().default(""),
  dataMovimentacao: z.string().date(),
});

const resolverLoteSchema = z.object({
  pessoas: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(200),
        matricula: z.string().trim().max(80).optional().default(""),
        cpf: z.string().trim().max(20).optional().default(""),
      }),
    )
    .min(1)
    .max(500),
});

const movimentacaoLoteSchema = z.object({
  pessoas: z
    .array(
      z.object({
        personId: z.number().int().positive(),
        personExternalId: z.string().trim().optional().default(""),
        colaborador: z.string().trim().min(1).max(200),
        postoAtualId: z.number().int().positive().nullable(),
        postoAtual: z.string().trim().optional().default(""),
      }),
    )
    .min(1)
    .max(500),
  novoPostoId: z.number().int().positive(),
  novoPostoExternalId: z.string().trim().optional().default(""),
  novoPosto: z.string().trim().min(1).max(250),
  dataMovimentacao: z.string().date(),
  motivo: z.string().trim().min(3).max(2000),
});

const validarDestinoLoteSchema = z.object({
  pessoas: z.array(z.object({ personId: z.number().int().positive(), colaborador: z.string().trim().min(1).max(200) })).min(1).max(500),
  novoPostoId: z.number().int().positive(),
  novoPostoExternalId: z.string().trim().optional().default(""),
  dataMovimentacao: z.string().date(),
});

type NextiResponse = {
  id?: string | number;
  message?: string;
  value?: { id?: string | number };
  comments?: unknown[];
};

type NextiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is NextiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapValue(value: unknown): unknown {
  return isRecord(value) && value["value"] !== undefined ? value["value"] : value;
}

function recordsFrom(value: unknown): NextiRecord[] {
  const payload = unwrapValue(value);
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["content", "data", "items", "results"]) {
    const nested = payload[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
  }
  return [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function numberValue(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function digits(value: unknown): string {
  return text(value).replace(/\D+/g, "");
}

async function listarPessoasNexti(config: Awaited<ReturnType<typeof loadConfig>>): Promise<NextiRecord[]> {
  const pessoas: NextiRecord[] = [];
  for (let page = 0; page < 60; page += 1) {
    const response = await requestNexti({
      config,
      endpoint: "/persons/all",
      method: "GET",
      query: { page, size: 200 },
    });
    const registros = recordsFrom(response.data);
    pessoas.push(...registros);
    if (registros.length < 200) break;
  }
  return pessoas;
}

export type PessoaMovimentacaoLote = {
  personId: number;
  personExternalId: string;
  colaborador: string;
  postoAtualId: number | null;
  postoAtual: string;
  encontrado: boolean;
  erro?: string;
};

/** Resolve os nomes/matrículas de uma planilha contra os colaboradores ativos da NEXTI. */
export const resolverPessoasMovimentacaoLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => resolverLoteSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const config = await loadConfig(context.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      const [pessoas, postosResponse] = await Promise.all([
        listarPessoasNexti(config),
        requestNexti({
          config,
          endpoint: "/workplaces/all",
          method: "GET",
          query: { page: 0, size: 5000 },
        }).catch(() => ({ data: [] })),
      ]);
      const postos = new Map<number, string>();
      for (const posto of recordsFrom(postosResponse.data)) {
        const id = numberValue(posto["id"] ?? posto["nextiId"]);
        const nome = text(posto["name"] ?? posto["nome"] ?? posto["description"]);
        if (id !== null && nome) postos.set(id, nome);
      }

      const ativos = pessoas.filter(
        (pessoa) => !text(pessoa["demissionDate"] ?? pessoa["dataDemissao"]),
      );
      const resultados: PessoaMovimentacaoLote[] = data.pessoas.map((entrada) => {
        const nome = normalize(entrada.nome);
        const matricula = digits(entrada.matricula);
        const cpf = digits(entrada.cpf);
        const correspondencias = ativos.filter((pessoa) => {
          const nomePessoa = normalize(
            text(pessoa["name"] ?? pessoa["nome"] ?? pessoa["personName"] ?? pessoa["fullName"]),
          );
          const matriculaPessoa = digits(
            pessoa["externalId"] ?? pessoa["personExternalId"] ?? pessoa["enrolment"],
          );
          const cpfPessoa = digits(pessoa["cpf"] ?? pessoa["document"] ?? pessoa["documentNumber"]);
          if (matricula && matriculaPessoa === matricula) return true;
          if (cpf && cpfPessoa === cpf) return true;
          return nomePessoa === nome;
        });
        if (correspondencias.length !== 1) {
          return {
            personId: 0,
            personExternalId: "",
            colaborador: entrada.nome,
            postoAtualId: null,
            postoAtual: "",
            encontrado: false,
            erro:
              correspondencias.length > 1
                ? "Mais de um colaborador corresponde a esta linha. Informe a matrícula."
                : "Colaborador ativo não encontrado na NEXTI.",
          };
        }
        const pessoa = correspondencias[0];
        if (!pessoa) {
          return {
            personId: 0,
            personExternalId: "",
            colaborador: entrada.nome,
            postoAtualId: null,
            postoAtual: "",
            encontrado: false,
            erro: "Colaborador ativo não encontrado na NEXTI.",
          };
        }
        const personId = numberValue(pessoa["id"] ?? pessoa["nextiId"]);
        const postoAtualId = numberValue(pessoa["workplaceId"] ?? pessoa["workplace"]);
        return {
          personId: personId ?? 0,
          personExternalId: text(
            pessoa["externalId"] ?? pessoa["personExternalId"] ?? pessoa["enrolment"],
          ),
          colaborador: text(
            pessoa["name"] ?? pessoa["nome"] ?? pessoa["personName"] ?? pessoa["fullName"],
          ),
          postoAtualId,
          postoAtual:
            text(pessoa["workplaceName"] ?? pessoa["postoAtual"]) ||
            (postoAtualId !== null ? (postos.get(postoAtualId) ?? "") : ""),
          encontrado: personId !== null,
          ...(personId === null
            ? { erro: "Colaborador sem identificador válido na NEXTI." }
            : {}),
        };
      });
      return { ok: true as const, pessoas: resultados };
    } catch (error) {
      return { ok: false as const, erro: mensagemErroNexti(error), pessoas: [] as PessoaMovimentacaoLote[] };
    }
  });

export type ResultadoMovimentacaoLote = {
  colaborador: string;
  ok: boolean;
  mensagem: string;
  nextiTransferId?: string;
};

export type ValidacaoDestinoLote = {
  personId: number;
  colaborador: string;
  ok: boolean;
  mensagem: string;
};

/** Confere na NEXTI se o destino possui vaga e efetivo disponível para o cargo de cada pessoa. */
export const validarDestinoMovimentacaoLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => validarDestinoLoteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const resultados: ValidacaoDestinoLote[] = [];
    try {
      const config = await loadConfig(context.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      for (const pessoa of data.pessoas) {
        try {
          const validacao = await validarVagaCompativel(
            config,
            pessoa.personId,
            data.novoPostoId,
            data.dataMovimentacao,
            data.novoPostoExternalId,
          );
          resultados.push({
            personId: pessoa.personId,
            colaborador: pessoa.colaborador,
            ok: validacao.ok,
            mensagem: validacao.ok ? validacao.detalhe : validacao.erro,
          });
        } catch (error) {
          resultados.push({
            personId: pessoa.personId,
            colaborador: pessoa.colaborador,
            ok: false,
            mensagem: mensagemErroNexti(error),
          });
        }
      }
    } catch (error) {
      for (const pessoa of data.pessoas) {
        resultados.push({
          personId: pessoa.personId,
          colaborador: pessoa.colaborador,
          ok: false,
          mensagem: mensagemErroNexti(error),
        });
      }
    }
    return { resultados, todosCompativeis: resultados.every((item) => item.ok) };
  });

/** Valida e movimenta diretamente na NEXTI cada colaborador válido do lote. */
export const executarMovimentacaoPostoLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => movimentacaoLoteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const resultados: ResultadoMovimentacaoLote[] = [];
    try {
      const config = await loadConfig(context.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      let workplaceExternalId = data.novoPostoExternalId;
      if (!workplaceExternalId) {
        try {
          const resposta = await requestNexti({
            config,
            endpoint: `/workplaces/${data.novoPostoId}`,
            method: "GET",
          });
          const posto = unwrapValue(resposta.data);
          if (isRecord(posto)) workplaceExternalId = text(posto["externalId"]);
        } catch {
          // O ID interno do posto é suficiente para o envio.
        }
      }

      const vistos = new Set<number>();
      for (const pessoa of data.pessoas) {
        if (vistos.has(pessoa.personId)) continue;
        vistos.add(pessoa.personId);
        if (pessoa.postoAtualId === data.novoPostoId) {
          resultados.push({
            colaborador: pessoa.colaborador,
            ok: false,
            mensagem: "Já está no posto de destino.",
          });
          continue;
        }
        try {
          const validacao = await validarVagaCompativel(
            config,
            pessoa.personId,
            data.novoPostoId,
            data.dataMovimentacao,
            workplaceExternalId,
          );
          if (!validacao.ok) {
            resultados.push({
              colaborador: pessoa.colaborador,
              ok: false,
              mensagem: validacao.erro,
            });
            continue;
          }
          const resposta = await requestNexti({
            config,
            endpoint: "/workplacetransfers",
            method: "POST",
            body: {
              personId: pessoa.personId,
              personExternalId: pessoa.personExternalId || undefined,
              workplaceId: data.novoPostoId,
              workplaceExternalId: workplaceExternalId || undefined,
              transferDateTime: dataHoraNexti(data.dataMovimentacao),
              observation: data.motivo,
            },
          });
          const payload = (resposta.data ?? {}) as NextiResponse;
          const rawId = payload.value?.id ?? payload.id ?? null;
          resultados.push({
            colaborador: pessoa.colaborador,
            ok: true,
            mensagem: `Movimentado para ${data.novoPosto}.`,
            ...(rawId === null ? {} : { nextiTransferId: String(rawId) }),
          });
        } catch (error) {
          resultados.push({
            colaborador: pessoa.colaborador,
            ok: false,
            mensagem: mensagemErroNexti(error),
          });
        }
      }
    } catch (error) {
      for (const pessoa of data.pessoas) {
        resultados.push({
          colaborador: pessoa.colaborador,
          ok: false,
          mensagem: mensagemErroNexti(error),
        });
      }
    }
    const sucessos = resultados.filter((item) => item.ok).length;
    return { resultados, sucessos, falhas: resultados.length - sucessos };
  });

function nextiDateIsActive(
  value: unknown,
  movementDate: string,
  boundary: "start" | "finish",
): boolean {
  const raw = text(value);
  if (!raw) return true;
  const match = /^(\d{2})(\d{2})(\d{4})/.exec(raw);
  if (!match) return true;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return boundary === "start" ? date <= movementDate : date >= movementDate;
}

/**
 * Conta o efetivo (colaboradores ativos) lotado no posto informado, agrupado por cargo.
 * Retorna null quando a NEXTI não permite apurar o efetivo.
 */
async function contarEfetivoPosto(
  config: Awaited<ReturnType<typeof loadConfig>>,
  workplaceId: number,
  workplaceExternalId?: string,
): Promise<{
  total: number;
  porCargoId: Map<number, number>;
  porCargoNome: Map<string, number>;
} | null> {
  // Endpoint oficial da NEXTI para o efetivo real lotado no posto.
  let externalId = (workplaceExternalId ?? "").trim();
  if (!externalId) {
    try {
      const workplaceResponse = await requestNexti({
        config,
        endpoint: `/workplaces/${workplaceId}`,
        method: "GET",
      });
      const workplace = unwrapValue(workplaceResponse.data);
      if (isRecord(workplace)) externalId = text(workplace["externalId"]);
    } catch {
      // Segue para o fallback abaixo.
    }
  }

  let pessoas: NextiRecord[] | null = null;
  if (externalId) {
    const encontrados: NextiRecord[] = [];
    try {
      for (let page = 0; page < 50; page += 1) {
        const response = await requestNexti({
          config,
          endpoint: `/persons/workplaceexternalid/${encodeURIComponent(externalId)}`,
          method: "GET",
          query: { page, size: 200 },
        });
        const registros = recordsFrom(response.data);
        encontrados.push(...registros);
        if (registros.length < 200) break;
      }
      pessoas = encontrados;
    } catch {
      pessoas = null;
    }
  }

  if (!pessoas) {
    // Última alternativa: varre a base paginada e filtra estritamente pelo posto.
    const encontrados: NextiRecord[] = [];
    try {
      for (let page = 0; page < 50; page += 1) {
        const response = await requestNexti({
          config,
          endpoint: "/persons/all",
          method: "GET",
          query: { page, size: 200 },
        });
        const registros = recordsFrom(response.data);
        encontrados.push(
          ...registros.filter((pessoa) => numberValue(pessoa["workplaceId"]) === workplaceId),
        );
        if (registros.length < 200) break;
      }
      pessoas = encontrados;
    } catch {
      return null;
    }
  }

  const ativos = pessoas.filter(
    (pessoa) => !text(pessoa["demissionDate"]) && !text(pessoa["dataDemissao"]),
  );
  const porCargoId = new Map<number, number>();
  const porCargoNome = new Map<string, number>();
  for (const pessoa of ativos) {
    const id = numberValue(pessoa["careerId"]);
    if (id !== null) porCargoId.set(id, (porCargoId.get(id) ?? 0) + 1);
    const nome = normalize(text(pessoa["nameCareer"] ?? pessoa["careerName"] ?? pessoa["cargo"]));
    if (nome) porCargoNome.set(nome, (porCargoNome.get(nome) ?? 0) + 1);
  }
  return { total: ativos.length, porCargoId, porCargoNome };
}

async function validarVagaCompativel(
  config: Awaited<ReturnType<typeof loadConfig>>,
  personId: number,
  workplaceId: number,
  movementDate: string,
  workplaceExternalId?: string,
): Promise<{ ok: true; cargo: string; detalhe: string } | { ok: false; erro: string }> {
  const pessoaResponse = await requestNexti({
    config,
    endpoint: `/persons/${personId}`,
    method: "GET",
  });
  const pessoa = unwrapValue(pessoaResponse.data);
  if (!isRecord(pessoa))
    return { ok: false, erro: "A NEXTI não retornou os dados do colaborador." };

  const careerId = numberValue(pessoa["careerId"]);
  const externalCareerId = text(pessoa["externalCareerId"]);
  let cargo = text(pessoa["nameCareer"] ?? pessoa["careerName"]);
  if (careerId === null && !externalCareerId) {
    return {
      ok: false,
      erro: "O colaborador não possui cargo definido na NEXTI. A movimentação não foi realizada.",
    };
  }
  if (!cargo && careerId !== null) {
    try {
      const careerResponse = await requestNexti({
        config,
        endpoint: `/careers/${careerId}`,
        method: "GET",
      });
      const career = unwrapValue(careerResponse.data);
      if (isRecord(career)) cargo = text(career["name"]);
    } catch {
      // O ID do cargo ainda permite uma comparação segura com a vaga.
    }
  }

  const vacancies: NextiRecord[] = [];
  for (let page = 0; page < 50; page += 1) {
    const response = await requestNexti({
      config,
      endpoint: `/workplacevacancies/workplace/${workplaceId}`,
      method: "GET",
      query: { page, size: 200 },
    });
    const pageRecords = recordsFrom(response.data);
    vacancies.push(...pageRecords);
    if (pageRecords.length < 200) break;
  }

  const cargoNormalizado = normalize(cargo);
  const vagaAtiva = (vacancy: NextiRecord) =>
    nextiDateIsActive(vacancy["startDateTime"], movementDate, "start") &&
    nextiDateIsActive(vacancy["finishDateTime"], movementDate, "finish");

  const vagaCompativel = (vacancy: NextiRecord) => {
    const careers = Array.isArray(vacancy["careerDtoList"])
      ? vacancy["careerDtoList"].filter(isRecord)
      : [];
    return careers.some((career) => {
      const vacancyCareerId = numberValue(career["id"]);
      const vacancyExternalId = text(career["externalId"]);
      const vacancyCareerName = normalize(text(career["name"]));
      return (
        (careerId !== null && vacancyCareerId === careerId) ||
        Boolean(externalCareerId && vacancyExternalId === externalCareerId) ||
        Boolean(cargoNormalizado && vacancyCareerName && vacancyCareerName === cargoNormalizado)
      );
    });
  };

  const quantidade = (vacancy: NextiRecord) => {
    const value = numberValue(vacancy["quantity"]);
    return value === null ? 1 : value;
  };

  const vagasAtivas = vacancies.filter(vagaAtiva);
  const vagasCompativeis = vagasAtivas.filter(
    (vacancy) => vagaCompativel(vacancy) && quantidade(vacancy) > 0,
  );
  const cargoLabel = cargo || externalCareerId || String(careerId);

  if (vagasCompativeis.length === 0) {
    return {
      ok: false,
      erro: `O novo posto não possui vaga ativa compatível com o cargo ${cargoLabel}. A movimentação não foi enviada à NEXTI.`,
    };
  }

  const totalVagasPosto = vagasAtivas.reduce(
    (soma, vacancy) => soma + Math.max(quantidade(vacancy), 0),
    0,
  );
  const vagasDoCargo = vagasCompativeis.reduce(
    (soma, vacancy) => soma + Math.max(quantidade(vacancy), 0),
    0,
  );

  const efetivo = await contarEfetivoPosto(config, workplaceId, workplaceExternalId);
  if (!efetivo) {
    return {
      ok: true,
      cargo: cargoLabel,
      detalhe: `Vaga compatível confirmada para ${cargoLabel}. O efetivo atual do posto não pôde ser apurado na NEXTI.`,
    };
  }

  const efetivoDoCargo =
    (careerId !== null ? (efetivo.porCargoId.get(careerId) ?? 0) : 0) ||
    (cargoNormalizado ? (efetivo.porCargoNome.get(cargoNormalizado) ?? 0) : 0);

  if (totalVagasPosto > 0 && efetivo.total >= totalVagasPosto) {
    return {
      ok: false,
      erro: `O posto de destino está completo: ${efetivo.total} efetivo de ${totalVagasPosto} vaga(s). Não há vaga sobrando para movimentar ${cargoLabel}. A movimentação não foi enviada à NEXTI.`,
    };
  }

  if (efetivoDoCargo >= vagasDoCargo) {
    return {
      ok: false,
      erro: `O posto está com vagas e efetivo iguais para o cargo ${cargoLabel} (${efetivoDoCargo} efetivo de ${vagasDoCargo} vaga(s)). Posto do novo destino: ${efetivo.total} efetivo de ${totalVagasPosto} vaga(s). A movimentação não foi enviada à NEXTI.`,
    };
  }

  return {
    ok: true,
    cargo: cargoLabel,
    detalhe: `Vaga compatível disponível para ${cargoLabel}: ${efetivoDoCargo} efetivo de ${vagasDoCargo} vaga(s) do cargo. Posto: ${efetivo.total} efetivo de ${totalVagasPosto} vaga(s).`,
  };
}

export const validarCompatibilidadeMovimentacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => compatibilidadeSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const config = await loadConfig(context.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      return await validarVagaCompativel(
        config,
        Number(data.personId),
        Number(data.novoPostoId),
        data.dataMovimentacao,
        data.novoPostoExternalId,
      );
    } catch (error) {
      return { ok: false as const, erro: mensagemErroNexti(error) };
    }
  });

function dataHoraNexti(data: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!match) throw new Error("Informe uma data válida para a movimentação.");
  return `${match[3]}${match[2]}${match[1]}000000`;
}

function mensagemErroNexti(error: unknown): string {
  const failure = error as Error & { nextiResponse?: string; httpStatus?: number };
  const detalhe = failure.nextiResponse?.trim();
  const status = failure.httpStatus ? ` (HTTP ${failure.httpStatus})` : "";
  return detalhe
    ? `A NEXTI recusou a movimentação${status}: ${detalhe.slice(0, 300)}`
    : `Não foi possível enviar a movimentação à NEXTI${status}: ${failure.message || "falha desconhecida"}`;
}

export type MovimentacaoPosto = {
  id: string;
  protocolo: string;
  status: "pendente" | "aprovada" | "recusada";
  colaborador: string;
  person_id: string | null;
  person_external_id: string | null;
  cargo: string | null;
  posto_atual: string;
  posto_atual_id: string | null;
  novo_posto: string;
  novo_posto_id: string | null;
  novo_posto_external_id: string | null;
  data_movimentacao: string;
  motivo: string;
  validacao_detalhe: string | null;
  criado_por_nome: string | null;
  created_at: string;
  aprovado_por_nome: string | null;
  aprovado_em: string | null;
  motivo_recusa: string | null;
  nexti_transfer_id: string | null;
  enviado_nexti_em: string | null;
  assinatura_colaborador: string | null;
};

const COLUNAS_MOVIMENTACAO =
  "id, protocolo, status, colaborador, person_id, person_external_id, cargo, posto_atual, posto_atual_id, novo_posto, novo_posto_id, novo_posto_external_id, data_movimentacao, motivo, validacao_detalhe, criado_por_nome, created_at, aprovado_por_nome, aprovado_em, motivo_recusa, nexti_transfer_id, enviado_nexti_em, assinatura_colaborador";

function gerarTokenAssinatura(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function gerarProtocoloMovimentacao(): string {
  const agora = new Date();
  const data = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, "0")}${String(agora.getDate()).padStart(2, "0")}`;
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `MOV-${data}-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

async function nomeDoUsuario(context: {
  supabase: any;
  userId: string;
  claims?: Record<string, unknown> | null;
}): Promise<string> {
  const { data: perfil } = await context.supabase
    .from("profiles")
    .select("nome, email")
    .eq("id", context.userId)
    .maybeSingle();
  return (
    (perfil?.nome as string | undefined) ||
    (perfil?.email as string | undefined) ||
    (context.claims?.["email"] as string | undefined) ||
    "Usuário"
  );
}

async function podeAutorizar(context: { supabase: any; userId: string }): Promise<boolean> {
  const { data } = await context.supabase.rpc("pode_autorizar_movimentacao", {
    _user_id: context.userId,
  });
  return data === true;
}

/** Supervisor: valida a vaga e envia a movimentação para autorização da coordenação (não envia à NEXTI). */
export const registrarMovimentacaoPosto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => movimentacaoSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (data.postoAtualId && data.postoAtualId === data.novoPostoId) {
      return { ok: false as const, erro: "O novo posto deve ser diferente do posto atual." };
    }

    const criadoPorNome = await nomeDoUsuario(context);

    let validacao: Awaited<ReturnType<typeof validarVagaCompativel>>;
    try {
      const config = await loadConfig(context.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      validacao = await validarVagaCompativel(
        config,
        Number(data.personId),
        Number(data.novoPostoId),
        data.dataMovimentacao,
        data.novoPostoExternalId,
      );
      if (!validacao.ok) return validacao;
    } catch (error) {
      return { ok: false as const, erro: mensagemErroNexti(error) };
    }

    const protocolo = gerarProtocoloMovimentacao();
    const token = gerarTokenAssinatura();
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: registro, error } = await context.supabase
      .from("movimentacoes_posto")
      .insert({
        criado_por: context.userId,
        criado_por_nome: criadoPorNome,
        protocolo,
        status: "pendente",
        colaborador: data.colaborador,
        person_id: data.personId || null,
        person_external_id: data.personExternalId || null,
        cargo: validacao.cargo,
        posto_atual: data.postoAtual,
        posto_atual_id: data.postoAtualId || null,
        novo_posto: data.novoPosto,
        novo_posto_id: data.novoPostoId || null,
        novo_posto_external_id: data.novoPostoExternalId || null,
        data_movimentacao: data.dataMovimentacao,
        motivo: data.motivo,
        validacao_detalhe: validacao.detalhe,
        assinatura_token: token,
        assinatura_token_expira_em: expiraEm,
      })
      .select("id")
      .single();

    if (error)
      return {
        ok: false as const,
        erro: "Não foi possível salvar a movimentação para a coordenação.",
      };
    const base = (data.origemUrl || "").replace(/\/+$/, "");
    return {
      ok: true as const,
      id: registro.id as string,
      protocolo,
      linkAssinatura: `${base}/assinar-movimentacao/${token}`,
      expiraEm,
    };
  });

/** Lista as movimentações enviadas à coordenação. */
export const listarMovimentacoesPosto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [autoriza, { data, error }] = await Promise.all([
      podeAutorizar(context),
      context.supabase
        .from("movimentacoes_posto")
        .select(COLUNAS_MOVIMENTACAO)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (error)
      return {
        ok: false as const,
        erro: error.message,
        podeAutorizar: autoriza,
        movimentacoes: [] as MovimentacaoPosto[],
      };
    return {
      ok: true as const,
      podeAutorizar: autoriza,
      movimentacoes: (data ?? []) as MovimentacaoPosto[],
    };
  });

/** Coordenação/admin: aceita (envia à NEXTI) ou recusa uma movimentação pendente. */
export const autorizarMovimentacaoPosto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        decisao: z.enum(["aceitar", "recusar"]),
        motivoRecusa: z.string().trim().max(1000).optional().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const log: string[] = [];
    const registrar = (mensagem: string) => {
      log.push(`${new Date().toLocaleTimeString("pt-BR")} · ${mensagem}`);
    };
    registrar(
      data.decisao === "aceitar"
        ? "Iniciando o envio da movimentação."
        : "Iniciando a recusa da movimentação.",
    );

    if (!(await podeAutorizar(context))) {
      return {
        ok: false as const,
        erro: "Apenas coordenadores e administradores podem autorizar movimentações.",
        log,
      };
    }

    const { data: mov, error: erroBusca } = await context.supabase
      .from("movimentacoes_posto")
      .select(COLUNAS_MOVIMENTACAO)
      .eq("id", data.id)
      .maybeSingle();
    if (erroBusca || !mov) return { ok: false as const, erro: "Movimentação não encontrada.", log };
    const registro = mov as MovimentacaoPosto;
    if (registro.status !== "pendente") {
      return { ok: false as const, erro: "Esta movimentação já foi analisada.", log };
    }

    const nome = await nomeDoUsuario(context);
    const agora = new Date().toISOString();

    if (data.decisao === "recusar") {
      const { error } = await context.supabase
        .from("movimentacoes_posto")
        .update({
          status: "recusada",
          aprovado_por: context.userId,
          aprovado_por_nome: nome,
          aprovado_em: agora,
          motivo_recusa: data.motivoRecusa || null,
        })
        .eq("id", data.id);
      if (error) return { ok: false as const, erro: error.message, log };
      registrar("Movimentação recusada e registrada.");
      return {
        ok: true as const,
        log,
        movimentacao: {
          ...registro,
          status: "recusada" as const,
          aprovado_por_nome: nome,
          aprovado_em: agora,
          motivo_recusa: data.motivoRecusa || null,
        },
      };
    }

    if (!registro.assinatura_colaborador) {
      return {
        ok: false as const,
        erro: "O colaborador ainda não assinou o documento pelo link de assinatura digital.",
        log,
      };
    }

    if (!registro.person_id || !registro.novo_posto_id) {
      return {
        ok: false as const,
        erro: "A movimentação não possui o colaborador ou o posto identificados na NEXTI.",
        log,
      };
    }

    let respostaNexti: Awaited<ReturnType<typeof requestNexti>>;
    let personExternalId = (registro.person_external_id ?? "").trim();
    let workplaceExternalId = (registro.novo_posto_external_id ?? "").trim();
    try {
      const config = await loadConfig(context.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      registrar("Conexão com a NEXTI configurada.");

      if (!personExternalId) {
        registrar("Buscando o código do colaborador na NEXTI...");
        const pessoa = unwrapValue(
          (
            await requestNexti({
              config,
              endpoint: `/persons/${Number(registro.person_id)}`,
              method: "GET",
            })
          ).data,
        );
        if (isRecord(pessoa)) personExternalId = text(pessoa["externalId"]);
        registrar(
          personExternalId
            ? `Código do colaborador: ${personExternalId}.`
            : "Colaborador sem código externo na NEXTI.",
        );
      }

      if (!workplaceExternalId) {
        registrar("Buscando o código do posto na NEXTI...");
        const posto = unwrapValue(
          (
            await requestNexti({
              config,
              endpoint: `/workplaces/${Number(registro.novo_posto_id)}`,
              method: "GET",
            })
          ).data,
        );
        if (isRecord(posto)) workplaceExternalId = text(posto["externalId"]);
        registrar(
          workplaceExternalId
            ? `Código do posto: ${workplaceExternalId}.`
            : "Posto sem código externo na NEXTI.",
        );
      }

      registrar("Validando cargo e vaga no posto de destino...");
      const validacao = await validarVagaCompativel(
        config,
        Number(registro.person_id),
        Number(registro.novo_posto_id),
        registro.data_movimentacao,
        workplaceExternalId,
      );
      if (!validacao.ok) {
        registrar(`Validação recusada: ${validacao.erro}`);
        return { ...validacao, log };
      }
      registrar(`Validação aprovada: ${validacao.detalhe}`);

      registrar("Enviando a movimentação para a NEXTI...");
      respostaNexti = await requestNexti({
        config,
        endpoint: "/workplacetransfers",
        method: "POST",
        body: {
          personId: Number(registro.person_id),
          personExternalId: personExternalId || undefined,
          workplaceId: Number(registro.novo_posto_id),
          workplaceExternalId: workplaceExternalId || undefined,
          transferDateTime: dataHoraNexti(registro.data_movimentacao),
          observation: registro.motivo,
        },
      });
      registrar(`NEXTI respondeu com status ${respostaNexti.status}.`);
    } catch (error) {
      registrar(`Falha na NEXTI: ${mensagemErroNexti(error)}`);
      return { ok: false as const, erro: mensagemErroNexti(error), log };
    }

    const payloadNexti = (respostaNexti.data ?? {}) as NextiResponse;
    const rawId = payloadNexti.value?.id ?? payloadNexti.id ?? null;
    const nextiTransferId = rawId === null ? null : String(rawId);
    registrar(
      nextiTransferId
        ? `Movimentação registrada na NEXTI (nº ${nextiTransferId}).`
        : "Movimentação aceita pela NEXTI.",
    );

    const { error } = await context.supabase
      .from("movimentacoes_posto")
      .update({
        status: "aprovada",
        aprovado_por: context.userId,
        aprovado_por_nome: nome,
        aprovado_em: agora,
        person_external_id: personExternalId || registro.person_external_id,
        novo_posto_external_id: workplaceExternalId || registro.novo_posto_external_id,
        nexti_transfer_id: nextiTransferId,
        nexti_http_status: respostaNexti.status,
        enviado_nexti_em: agora,
      })
      .eq("id", data.id);
    if (error) {
      registrar("Erro ao atualizar o registro local.");
      return {
        ok: false as const,
        erro: "A NEXTI confirmou a movimentação, mas o registro local não pôde ser atualizado. Procure a administração para evitar um envio duplicado.",
        log,
      };
    }
    registrar("Registro local atualizado. Processo concluído.");
    return {
      ok: true as const,
      log,
      movimentacao: {
        ...registro,
        status: "aprovada" as const,
        aprovado_por_nome: nome,
        aprovado_em: agora,
        nexti_transfer_id: nextiTransferId,
        enviado_nexti_em: agora,
      },
    };
  });

/** Relatório de movimentações por período (supervisão/coordenação). */
export const relatorioMovimentacoesPosto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        de: z.string().date(),
        ate: z.string().date(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: linhas, error } = await context.supabase
      .from("movimentacoes_posto")
      .select(
        `${COLUNAS_MOVIMENTACAO}, assinatura_nome, assinatura_em, assinatura_ip, assinatura_dispositivo, assinatura_latitude, assinatura_longitude, assinatura_geo_status`,
      )
      .gte("data_movimentacao", data.de)
      .lte("data_movimentacao", data.ate)
      .order("data_movimentacao", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error)
      return {
        ok: false as const,
        erro: "Não foi possível gerar o relatório.",
        movimentacoes: [] as MovimentacaoRelatorio[],
      };
    return { ok: true as const, movimentacoes: (linhas ?? []) as MovimentacaoRelatorio[] };
  });

export type MovimentacaoRelatorio = MovimentacaoPosto & {
  assinatura_nome: string | null;
  assinatura_em: string | null;
  assinatura_ip: string | null;
  assinatura_dispositivo: string | null;
  assinatura_latitude: number | null;
  assinatura_longitude: number | null;
  assinatura_geo_status: string | null;
};
