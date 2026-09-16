import * as XLSX from "xlsx";
import { NAO_IDENTIFICADO, type ColaboradorExtraido } from "./cartoes-ponto-parser";

export interface ResultadoPlanilha {
  registros: ColaboradorExtraido[];
  totalLinhas: number;
  duplicadosIgnorados: number;
  abasLidas: string[];
  abasIgnoradas: string[];
}

type Campo = "nome" | "cargo" | "posto";

/**
 * Apenas três colunas são reconhecidas na importação de funcionários ativos.
 * Todo o restante do arquivo é ignorado.
 */
const SINONIMOS: Record<Campo, string[]> = {
  nome: ["nome do funcionario"],
  cargo: ["nome da funcao"],
  posto: ["descricao do setor"],
};

const CAMPOS = Object.keys(SINONIMOS) as Campo[];

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function chaveComparavel(texto: string): string {
  return normalizar(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:;_/\\-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Mapeia os cabeçalhos da planilha para os cinco campos aceitos.
 * Passa três vezes (igualdade, prefixo e conteúdo) para que títulos
 * específicos como "NOME DA FUNÇÃO" não sejam capturados por "nome".
 */
function mapearColunas(cabecalho: string[]): Partial<Record<Campo, number>> {
  const mapa: Partial<Record<Campo, number>> = {};
  const usadas = new Set<number>();
  const chaves = cabecalho.map((t) => chaveComparavel(t));

  const tentar = (teste: (chave: string, sinonimo: string) => boolean) => {
    for (const campo of CAMPOS) {
      if (mapa[campo] !== undefined) continue;
      for (const sinonimo of SINONIMOS[campo]) {
        const indice = chaves.findIndex(
          (chave, i) => chave !== "" && !usadas.has(i) && teste(chave, sinonimo),
        );
        if (indice >= 0) {
          mapa[campo] = indice;
          usadas.add(indice);
          break;
        }
      }
    }
  };

  tentar((chave, s) => chave === s);
  tentar((chave, s) => chave.startsWith(s));
  tentar((chave, s) => chave.includes(s));
  return mapa;
}

function encontrarCabecalho(
  linhas: string[][],
): { indice: number; colunas: Partial<Record<Campo, number>> } | null {
  const limite = Math.min(linhas.length, 25);
  for (let i = 0; i < limite; i += 1) {
    const linha = (linhas[i] ?? []).map((c) => normalizar(c));
    if (linha.every((c) => c === "")) continue;
    const colunas = mapearColunas(linha);
    if (colunas.nome !== undefined) {
      return { indice: i, colunas };
    }
  }
  return null;
}

export async function importarPlanilhaColaboradores(file: File): Promise<ResultadoPlanilha> {
  const buffer = await file.arrayBuffer();
  // raw: false + defval mantém tudo como texto, preservando zeros à esquerda.
  const workbook = XLSX.read(buffer, { type: "array", raw: false, codepage: 65001 });
  if (workbook.SheetNames.length === 0) throw new Error("A planilha está vazia.");

  const registros: ColaboradorExtraido[] = [];
  const vistos = new Set<string>();
  const abasLidas: string[] = [];
  const abasIgnoradas: string[] = [];
  let duplicadosIgnorados = 0;
  let totalLinhas = 0;
  let linhaGlobal = 0;

  // Percorre TODAS as abas do arquivo.
  for (const nomeAba of workbook.SheetNames) {
    const sheet = workbook.Sheets[nomeAba];
    if (!sheet) {
      abasIgnoradas.push(nomeAba);
      continue;
    }

    const linhas = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    const cabecalho = encontrarCabecalho(linhas);
    if (!cabecalho) {
      abasIgnoradas.push(nomeAba);
      continue;
    }
    abasLidas.push(nomeAba);
    const { colunas } = cabecalho;

    linhas.slice(cabecalho.indice + 1).forEach((linha) => {
      const valor = (campo: Campo) => {
        const col = colunas[campo];
        const bruto = col === undefined ? "" : normalizar(linha[col]);
        return bruto === "" ? NAO_IDENTIFICADO : bruto;
      };

      const nome = valor("nome");
      const cargo = valor("cargo");
      const posto = valor("posto");

      // Só o nome é obrigatório; o restante do arquivo é ignorado.
      if (nome === NAO_IDENTIFICADO) return;
      // Ignora repetição de cabeçalho.
      if (CAMPOS.some((c) => SINONIMOS[c].includes(chaveComparavel(nome)))) return;

      totalLinhas += 1;
      linhaGlobal += 1;

      const chave = `${chaveComparavel(nome)}|${chaveComparavel(cargo)}|${chaveComparavel(posto)}`;
      if (vistos.has(chave)) {
        duplicadosIgnorados += 1;
        return;
      }
      vistos.add(chave);

      registros.push({
        pagina: linhaGlobal,
        empresa: NAO_IDENTIFICADO,
        nome,
        cargo,
        posto,
        matricula: NAO_IDENTIFICADO,
        revisar: [cargo, posto].some((v) => v === NAO_IDENTIFICADO),
      });
    });
  }

  if (abasLidas.length === 0) {
    throw new Error(
      "Nenhuma aba com cabeçalho reconhecido. Use as colunas: NOME DO FUNCIONÁRIO, NOME DA FUNÇÃO, DESCRICAO DO SETOR.",
    );
  }
  if (registros.length === 0) {
    throw new Error("Nenhum funcionário foi encontrado na planilha.");
  }

  return { registros, totalLinhas, duplicadosIgnorados, abasLidas, abasIgnoradas };
}
