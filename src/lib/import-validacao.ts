/**
 * Validação compartilhada da importação de arquivos dos dashboards
 * (Faltas e Atestados).
 *
 * Objetivo: antes de alimentar o dashboard, conferir arquivo por arquivo se o
 * conteúdo realmente serve — extensão, tamanho, leitura, presença de um
 * cabeçalho reconhecível, colunas essenciais e linhas realmente novas — e
 * devolver um relatório legível para a tela.
 */

import { parseAnyFile, type ParsedRow } from "@/lib/file-parsers";
import { mapearCabecalho, mesclarLinhas, type TargetColumn } from "@/lib/tabular-extract";

export const EXTENSOES_ACEITAS = [".pdf", ".csv", ".xlsx", ".xls", ".txt", ".tsv"];
export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

export type DestinoImportacao = "FALTAS" | "ATESTADOS";

type Definicao = {
  titulo: string;
  colunas: TargetColumn[];
  essenciais: string[];
  minimo: number;
};

const COLUNAS_FALTAS: TargetColumn[] = [
  {
    key: "posto",
    labels: ["posto", "posto/centro de custo", "centro de custo", "local", "unidade"],
  },
  {
    key: "colaborador",
    labels: [
      "colaborador",
      "nome",
      "funcionario",
      "funcionário",
      "empregado",
      "profissional",
      "vigilante",
    ],
  },
  { key: "cargo", labels: ["cargo", "função", "funcao", "ocupação", "ocupacao"] },
  {
    key: "gerente",
    labels: [
      "area",
      "área",
      "gerente",
      "gerente de area",
      "gerente de área",
      "gestor",
      "supervisor",
      "responsavel",
      "responsável",
      "coordenador",
    ],
  },
  {
    key: "dataInicio",
    labels: [
      "data inicio",
      "data início",
      "inicio",
      "início",
      "dt inicio",
      "data_inicio",
      "entrada",
      "check-in",
      "checkin",
    ],
  },
  {
    key: "dataFim",
    labels: ["data fim", "fim", "dt fim", "data_fim", "saida", "saída", "check-out", "termino"],
  },
  {
    key: "faltas",
    labels: ["faltas", "falta", "ausencia", "ausência", "qtd faltas", "total faltas", "dias falta"],
  },
  { key: "tipo", labels: ["tipo", "motivo", "ocorrencia", "ocorrência"] },
];

const COLUNAS_ATESTADOS: TargetColumn[] = [
  {
    key: "colaborador",
    labels: ["colaborador", "nome", "funcionario", "empregado", "paciente", "vigilante"],
  },
  { key: "posto", labels: ["posto", "centro de custo", "local", "unidade", "cliente"] },
  { key: "cargo", labels: ["cargo", "funcao", "ocupacao"] },
  { key: "cid", labels: ["cid", "cid10", "codigo cid", "doenca", "diagnostico"] },
  { key: "medico", labels: ["medico", "profissional emissor", "crm", "medico responsavel"] },
  {
    key: "dias",
    labels: ["dias", "dias afastamento", "qtd dias", "total dias", "afastamento"],
  },
  {
    key: "dataInicio",
    labels: ["data inicio", "inicio", "dt inicio", "data_inicio", "data emissao", "emissao"],
  },
  { key: "dataFim", labels: ["data fim", "fim", "dt fim", "data_fim", "termino", "retorno"] },
];

const ROTULOS: Record<string, string> = {
  posto: "Posto",
  colaborador: "Colaborador",
  cargo: "Cargo",
  gerente: "Gerente/Área",
  dataInicio: "Data início",
  dataFim: "Data fim",
  faltas: "Faltas",
  tipo: "Tipo",
  cid: "CID",
  medico: "Médico",
  dias: "Dias",
};

const DEFINICOES: Record<DestinoImportacao, Definicao> = {
  FALTAS: {
    titulo: "Faltas",
    colunas: COLUNAS_FALTAS,
    essenciais: ["colaborador", "posto"],
    minimo: 2,
  },
  ATESTADOS: {
    titulo: "Atestados",
    colunas: COLUNAS_ATESTADOS,
    essenciais: ["colaborador"],
    minimo: 2,
  },
};

export type StatusArquivo = "ok" | "aviso" | "erro";

export type RelatorioArquivo = {
  arquivo: string;
  tamanho: number;
  status: StatusArquivo;
  linhas: number;
  novas: number;
  reconhecidas: string[];
  faltando: string[];
  mensagens: string[];
};

export type ResultadoValidacao = {
  relatorios: RelatorioArquivo[];
  /** Linhas aprovadas (já sem duplicatas internas). */
  linhas: ParsedRow[];
  arquivosOk: number;
  arquivosComErro: number;
  arquivosComAviso: number;
  total: number;
};

export function extensaoAceita(nome: string): boolean {
  const n = nome.toLowerCase();
  return EXTENSOES_ACEITAS.some((ext) => n.endsWith(ext));
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function melhorCabecalho(rows: ParsedRow[], colunas: TargetColumn[]) {
  let melhor: { mapping: Record<string, number>; matches: number } = { mapping: {}, matches: 0 };
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const preenchidas = row.map((c) => (c ?? "").trim()).filter((c) => c !== "");
    if (preenchidas.length < 2) continue;
    const numericas = preenchidas.filter((c) => /^[\d.,/:-]+$/.test(c)).length;
    if (numericas / preenchidas.length >= 0.5) continue;
    const atual = mapearCabecalho(row, colunas);
    if (atual.matches > melhor.matches) melhor = atual;
  }
  return melhor;
}

function chaveLinha(row: ParsedRow): string {
  return row.map((c) => (c ?? "").trim()).join("\u0001");
}

/**
 * Lê e valida cada arquivo selecionado. Nenhuma linha de um arquivo com erro
 * entra no resultado — assim o dashboard nunca recebe conteúdo inválido.
 */
export async function validarArquivosDashboard(
  arquivos: File[],
  destino: DestinoImportacao,
  anteriores: ParsedRow[] = [],
): Promise<ResultadoValidacao> {
  const def = DEFINICOES[destino];
  const relatorios: RelatorioArquivo[] = [];
  const aprovadas: ParsedRow[] = [];
  const vistas = new Set<string>(anteriores.map(chaveLinha));
  const nomesUsados = new Set<string>();

  for (const file of arquivos) {
    const base: RelatorioArquivo = {
      arquivo: file.name,
      tamanho: file.size,
      status: "ok",
      linhas: 0,
      novas: 0,
      reconhecidas: [],
      faltando: [],
      mensagens: [],
    };

    const nomeNormalizado = file.name.trim().toLowerCase();
    if (nomesUsados.has(nomeNormalizado)) {
      relatorios.push({
        ...base,
        status: "aviso",
        mensagens: ["Arquivo repetido nesta seleção — ignorado."],
      });
      continue;
    }
    nomesUsados.add(nomeNormalizado);

    if (!extensaoAceita(file.name)) {
      relatorios.push({
        ...base,
        status: "erro",
        mensagens: [`Formato não aceito. Use ${EXTENSOES_ACEITAS.join(", ")}.`],
      });
      continue;
    }

    if (file.size === 0) {
      relatorios.push({ ...base, status: "erro", mensagens: ["Arquivo vazio (0 KB)."] });
      continue;
    }

    if (file.size > TAMANHO_MAXIMO) {
      relatorios.push({
        ...base,
        status: "erro",
        mensagens: [
          `Arquivo muito grande (${formatarTamanho(file.size)}). Limite de ${formatarTamanho(TAMANHO_MAXIMO)} por arquivo.`,
        ],
      });
      continue;
    }

    let rows: ParsedRow[];
    try {
      rows = await parseAnyFile(file);
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : "erro desconhecido";
      relatorios.push({ ...base, status: "erro", mensagens: [detalhe] });
      continue;
    }

    if (rows.length === 0) {
      relatorios.push({
        ...base,
        status: "erro",
        mensagens: ["Nenhuma linha encontrada no arquivo."],
      });
      continue;
    }

    const { mapping, matches } = melhorCabecalho(rows, def.colunas);
    const reconhecidas = Object.keys(mapping).map((k) => ROTULOS[k] ?? k);
    const faltando = def.essenciais.filter((k) => !(k in mapping)).map((k) => ROTULOS[k] ?? k);

    if (matches < def.minimo) {
      relatorios.push({
        ...base,
        status: "erro",
        linhas: rows.length,
        reconhecidas,
        mensagens: [
          `Não encontrei um cabeçalho compatível com o dashboard de ${def.titulo}. Esperado colunas como ${def.colunas
            .slice(0, 4)
            .map((c) => ROTULOS[c.key] ?? c.key)
            .join(", ")}.`,
        ],
      });
      continue;
    }

    const mensagens: string[] = [];
    let status: StatusArquivo = "ok";

    if (faltando.length > 0) {
      status = "aviso";
      mensagens.push(`Colunas essenciais não localizadas: ${faltando.join(", ")}.`);
    }

    const novas: ParsedRow[] = [];
    let repetidas = 0;
    for (const row of rows) {
      const chave = chaveLinha(row);
      if (chave.replace(/\u0001/g, "").trim() === "") continue;
      if (vistas.has(chave)) {
        repetidas += 1;
        continue;
      }
      vistas.add(chave);
      novas.push(row);
    }

    if (repetidas > 0) {
      mensagens.push(`${repetidas} linha(s) já existiam e não foram duplicadas.`);
      if (status === "ok") status = "aviso";
    }

    if (novas.length === 0) {
      status = "aviso";
      mensagens.push("Nenhuma linha nova para adicionar ao dashboard.");
    }

    aprovadas.push(...novas);
    relatorios.push({
      ...base,
      status,
      linhas: rows.length,
      novas: novas.length,
      reconhecidas,
      faltando,
      mensagens,
    });
  }

  return {
    relatorios,
    linhas: mesclarLinhas([], aprovadas),
    arquivosOk: relatorios.filter((r) => r.status === "ok").length,
    arquivosComAviso: relatorios.filter((r) => r.status === "aviso").length,
    arquivosComErro: relatorios.filter((r) => r.status === "erro").length,
    total: relatorios.length,
  };
}
