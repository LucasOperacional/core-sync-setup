import * as XLSX from "xlsx";
import type { PessoaCadastro } from "@/lib/nexti-usuarios.functions";

/**
 * Leitura e conversão da planilha de cadastro de usuários para o formato
 * aceito pela API da NEXTI. Toda coluna reconhecida é convertida para o
 * formato final (CPF/PIS só dígitos, datas dd/MM/aaaa, sexo F/M etc.),
 * de modo que o envio não falhe por formatação.
 */

export type Campo = keyof PessoaCadastro;

type Regra = {
  chave: Campo;
  rotulo: string;
  /** termos que identificam a coluna (já normalizados) */
  termos: string[];
  /** termos que desqualificam a coluna */
  exclui?: string[];
};

export const REGRAS_COLUNAS: Regra[] = [
  { chave: "cpf", rotulo: "CPF", termos: ["cpf", "c.p.f"] },
  { chave: "pis", rotulo: "PIS", termos: ["pis", "nis", "pasep"] },
  {
    chave: "matricula",
    rotulo: "Matrícula",
    termos: ["matricula", "enrolment", "registro", "chapa", "codigo do funcionario"],
  },
  { chave: "rg", rotulo: "RG", termos: ["rg", "identidade", "registro geral"] },
  { chave: "email", rotulo: "E-mail", termos: ["email", "e-mail"] },
  {
    chave: "telefone",
    rotulo: "Telefone",
    termos: [
      "celular",
      "telefone celular",
      "telefone 1",
      "telefone",
      "fone",
      "whatsapp",
      "contato",
      "tel",
      "phone",
    ],
    exclui: ["2", "recado", "emergencia", "comercial", "fixo"],
  },
  {
    chave: "telefone2",
    rotulo: "Telefone 2",
    termos: [
      "telefone 2",
      "telefone2",
      "celular 2",
      "segundo telefone",
      "telefone fixo",
      "fone fixo",
      "telefone recado",
      "telefone comercial",
      "phone2",
      "telefone",
    ],
  },
  { chave: "genero", rotulo: "Sexo", termos: ["sexo", "genero"] },
  {
    chave: "nascimento",
    rotulo: "Nascimento",
    termos: ["nascimento", "data nasc", "dt nasc", "dtnasc", "birth"],
  },
  {
    chave: "admissao",
    rotulo: "Admissão",
    termos: ["admissao", "data adm", "dt adm", "dtadm", "admission"],
  },
  { chave: "empresa", rotulo: "Empresa", termos: ["empresa", "company", "cliente", "contratante"] },
  {
    chave: "cargo",
    rotulo: "Cargo",
    // "NOME DA FUNÇÃO" vem antes de "COD FUNÇÃO": o nome é o que a NEXTI reconhece.
    termos: ["nome da funcao", "descricao da funcao", "cargo", "funcao", "career", "ocupacao"],
    exclui: ["local", "setor", "cod"],
  },
  {
    chave: "posto",
    rotulo: "Posto",
    termos: [
      "descricao do setor",
      "posto",
      "lotacao",
      "workplace",
      "setor",
      "unidade",
      "local",
    ],
    exclui: ["cod"],
  },
  {
    chave: "jornada",
    rotulo: "Jornada",
    termos: ["descricao da jornada", "jornada", "horario de trabalho"],
    exclui: ["cod"],
  },
  {
    chave: "escala",
    rotulo: "Escala",
    termos: ["descricao da escala", "escala", "horario", "schedule", "turno"],
    exclui: ["cod"],
  },
  { chave: "mae", rotulo: "Nome da mãe", termos: ["mae", "nome da mae", "filiacao 1"] },
  { chave: "pai", rotulo: "Nome do pai", termos: ["pai", "nome do pai", "filiacao 2"] },
  {
    chave: "nome",
    rotulo: "Nome",
    termos: ["nome do funcionario", "nome completo", "colaborador", "funcionario", "nome"],
    exclui: ["mae", "pai", "funcao", "setor", "empresa", "escala", "cargo", "local"],
  },
];

export function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function soDigitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

function dataExcel(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 60000) return null;
  const base = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(base);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Converte qualquer representação de data para dd/MM/aaaa. */
export function paraData(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${String(valor.getDate()).padStart(2, "0")}/${String(valor.getMonth() + 1).padStart(2, "0")}/${valor.getFullYear()}`;
  }
  if (typeof valor === "number") return dataExcel(valor) ?? "";
  const texto = String(valor).trim();
  if (!texto) return "";
  if (/^\d+([.,]\d+)?$/.test(texto) && !/^\d{8}$/.test(texto)) {
    const conv = dataExcel(Number(texto.replace(",", ".")));
    if (conv) return conv;
  }
  const iso = texto.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (br) {
    const ano = br[3]!.length === 2 ? `19${br[3]}` : br[3]!;
    return `${br[1]!.padStart(2, "0")}/${br[2]!.padStart(2, "0")}/${ano}`;
  }
  const junto = texto.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (junto) return `${junto[1]}/${junto[2]}/${junto[3]}`;
  return texto;
}

function paraSexo(valor: string): string {
  const n = normalizarTexto(valor);
  if (!n) return "";
  if (n.startsWith("f") || n.includes("femin") || n === "2") return "F";
  if (n.startsWith("m") || n.includes("mascul") || n === "1") return "M";
  return "";
}

function limparNome(valor: string): string {
  return valor.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Aplica a conversão final de cada campo para o formato da NEXTI. */
export function converterCampo(chave: Campo, bruto: unknown): string {
  if (bruto instanceof Date || typeof bruto === "number") {
    if (chave === "nascimento" || chave === "admissao") return paraData(bruto);
  }
  const texto = bruto === null || bruto === undefined ? "" : String(bruto).trim();
  switch (chave) {
    case "cpf": {
      const d = soDigitos(texto);
      return d ? d.padStart(11, "0").slice(-11) : "";
    }
    case "pis": {
      const d = soDigitos(texto);
      return d ? d.padStart(11, "0").slice(-11) : "";
    }
    case "matricula":
      return soDigitos(texto) || texto;
    case "rg":
      return texto.replace(/\s+/g, "").toUpperCase();
    case "email":
      return texto.toLowerCase().replace(/\s+/g, "");
    case "telefone":
    case "telefone2": {
      // Mantém apenas dígitos; remove DDI 55 quando o número fica com 12/13 dígitos.
      let d = soDigitos(texto);
      if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
      return d;
    }
    case "genero":
      return paraSexo(texto);
    case "nascimento":
    case "admissao":
      return paraData(texto);
    case "nome":
    case "mae":
    case "pai":
      return limparNome(texto);
    default:
      return texto.replace(/\s+/g, " ").trim();
  }
}

function mapearColunas(cabecalho: string[]): Map<Campo, number> {
  const chaves = cabecalho.map((c) => normalizarTexto(c));
  const mapa = new Map<Campo, number>();
  const usados = new Set<number>();

  const tentar = (teste: (chave: string, termo: string) => boolean) => {
    for (const regra of REGRAS_COLUNAS) {
      if (mapa.has(regra.chave)) continue;
      for (const termo of regra.termos) {
        const idx = chaves.findIndex(
          (chave, i) =>
            chave !== "" &&
            !usados.has(i) &&
            teste(chave, termo) &&
            !(regra.exclui ?? []).some((e) => chave.includes(e)),
        );
        if (idx >= 0) {
          mapa.set(regra.chave, idx);
          usados.add(idx);
          break;
        }
      }
    }
  };

  tentar((chave, termo) => chave === termo);
  tentar((chave, termo) => chave.startsWith(termo));
  tentar((chave, termo) => chave.includes(termo));
  return mapa;
}

function acharCabecalho(linhas: unknown[][]): { indice: number; mapa: Map<Campo, number> } | null {
  const limite = Math.min(linhas.length, 20);
  let melhor: { indice: number; mapa: Map<Campo, number> } | null = null;
  for (let i = 0; i < limite; i += 1) {
    const linha = (linhas[i] ?? []).map((c) => String(c ?? ""));
    if (linha.every((c) => c.trim() === "")) continue;
    const mapa = mapearColunas(linha);
    if (!mapa.has("nome")) continue;
    if (!melhor || mapa.size > melhor.mapa.size) melhor = { indice: i, mapa };
  }
  return melhor;
}

export type LeituraPlanilha = {
  pessoas: PessoaCadastro[];
  colunasReconhecidas: { chave: Campo; rotulo: string; coluna: string }[];
  colunasIgnoradas: string[];
};

export async function lerPlanilhaUsuarios(file: File): Promise<LeituraPlanilha> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const utf8 = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    raw: false,
    codepage: utf8 ? 65001 : 1252,
  });
  const nomeAba = wb.SheetNames[0];
  const ws = nomeAba ? wb.Sheets[nomeAba] : undefined;
  if (!ws) throw new Error("A planilha está vazia.");

  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  const cabecalho = acharCabecalho(linhas);
  if (!cabecalho) throw new Error("Não encontrei a coluna de nome na planilha.");

  const titulos = (linhas[cabecalho.indice] ?? []).map((c) => String(c ?? "").trim());
  const colunasReconhecidas = REGRAS_COLUNAS.filter((r) => cabecalho.mapa.has(r.chave))
    .map((r) => ({
      chave: r.chave,
      rotulo: r.rotulo,
      coluna: titulos[cabecalho.mapa.get(r.chave)!] ?? "",
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const usados = new Set(cabecalho.mapa.values());
  const colunasIgnoradas = titulos.filter((t, i) => t !== "" && !usados.has(i));

  const pessoas: PessoaCadastro[] = [];
  for (const linha of linhas.slice(cabecalho.indice + 1)) {
    if (!Array.isArray(linha) || linha.length === 0) continue;
    const pessoa: PessoaCadastro = { nome: "", cpf: "" };
    for (const [chave, idx] of cabecalho.mapa) {
      const valor = converterCampo(chave, linha[idx]);
      if (valor) (pessoa as Record<string, string>)[chave] = valor;
    }
    if (!pessoa.nome) continue;
    // Repetição do cabeçalho no meio do arquivo.
    if (normalizarTexto(pessoa.nome).includes("nome do funcionario")) continue;
    if (!pessoa.cpf) pessoa.cpf = "";
    pessoas.push(pessoa);
  }

  if (pessoas.length === 0) throw new Error("Nenhum colaborador encontrado na planilha.");
  return { pessoas, colunasReconhecidas, colunasIgnoradas };
}
