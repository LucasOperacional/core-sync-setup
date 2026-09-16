/**
 * Extração dos dados de cabeçalho dos cartões de ponto.
 * Cada página do PDF corresponde a um colaborador.
 * Somente Empresa, Nome (Colaborador), Cargo, Posto e Matrícula são extraídos.
 */

export const NAO_IDENTIFICADO = "Não identificado";

export interface ColaboradorExtraido {
  pagina: number;
  empresa: string;
  nome: string;
  cargo: string;
  posto: string;
  matricula: string;
  revisar: boolean;
}

export interface ResultadoImportacao {
  registros: ColaboradorExtraido[];
  totalPaginas: number;
  paginasComOcr: number[];
  duplicadosIgnorados: number;
}

function normalizar(texto: string): string {
  return texto
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Rótulos que encerram a captura de um campo dentro da mesma linha. */
const ROTULOS = [
  "Empresa",
  "Colaborador",
  "Cargo",
  "Posto",
  "Matrícula",
  "Matricula",
  "CNPJ",
  "CPF",
  "PIS",
  "Cliente",
  "Escala",
  "Período",
  "Periodo",
  "Admissão",
  "Admissao",
  "Jornada",
  "Horário",
  "Horario",
  "Data",
];

function capturar(texto: string, rotulos: string[]): string {
  for (const rotulo of rotulos) {
    // Rótulo seguido de ":" e o conteúdo até o próximo rótulo ou fim da linha
    const outros = ROTULOS.filter((r) => r.toLowerCase() !== rotulo.toLowerCase())
      .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const regex = new RegExp(
      `${rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([\\s\\S]*?)(?=\\s{0,}(?:${outros})\\s*:|\\n|$)`,
      "i",
    );
    const match = regex.exec(texto);
    if (match?.[1]) {
      const valor = normalizar(match[1]);
      if (valor.length > 0) return valor;
    }
  }
  return NAO_IDENTIFICADO;
}

export function extrairDaPagina(texto: string, pagina: number): ColaboradorExtraido {
  const limpo = texto.replace(/\r/g, "");
  const empresa = capturar(limpo, ["Empresa"]);
  const nome = capturar(limpo, ["Colaborador"]);
  const cargo = capturar(limpo, ["Cargo"]);
  const posto = capturar(limpo, ["Posto"]);
  const matriculaBruta = capturar(limpo, ["Matrícula", "Matricula"]);
  // Preserva zeros à esquerda: mantém como texto, sem conversão numérica.
  const matricula =
    matriculaBruta === NAO_IDENTIFICADO
      ? NAO_IDENTIFICADO
      : normalizar(matriculaBruta).split(" ")[0] || NAO_IDENTIFICADO;

  const campos = [empresa, nome, cargo, posto, matricula];
  return {
    pagina,
    empresa,
    nome,
    cargo,
    posto,
    matricula,
    revisar: campos.some((c) => c === NAO_IDENTIFICADO),
  };
}

async function carregarPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

/** OCR de uma página renderizada em canvas (PDF digitalizado / imagem). */
async function ocrDaPagina(page: {
  getViewport: (p: { scale: number }) => { width: number; height: number };
  render: (p: Record<string, unknown>) => { promise: Promise<void> };
}): Promise<string> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return "";
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  const { default: Tesseract } = await import("tesseract.js");
  const { data } = await Tesseract.recognize(canvas, "por");
  return data.text ?? "";
}

export async function importarCartoesPonto(
  file: File,
  onProgress?: (paginaAtual: number, total: number) => void,
): Promise<ResultadoImportacao> {
  const pdfjs = await carregarPdfjs();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const registros: ColaboradorExtraido[] = [];
  const paginasComOcr: number[] = [];
  const vistos = new Set<string>();
  let duplicadosIgnorados = 0;

  for (let numero = 1; numero <= doc.numPages; numero++) {
    onProgress?.(numero, doc.numPages);
    const page = await doc.getPage(numero);
    const content = await page.getTextContent();
    let texto = montarTexto(content);

    if (normalizar(texto).length < 20) {
      // PDF digitalizado: usa OCR automaticamente
      texto = await ocrDaPagina(page as never);
      paginasComOcr.push(numero);
    }

    const registro = extrairDaPagina(texto, numero);
    const chave = `${registro.empresa.toLowerCase()}|${registro.matricula.toLowerCase()}`;
    if (registro.matricula !== NAO_IDENTIFICADO && vistos.has(chave)) {
      duplicadosIgnorados++;
      continue;
    }
    vistos.add(chave);
    registros.push(registro);
  }

  return {
    registros,
    totalPaginas: doc.numPages,
    paginasComOcr,
    duplicadosIgnorados,
  };
}

interface TextItem {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
}

/** Reconstrói o texto por linhas usando a posição vertical dos itens. */
function montarTexto(content: { items: unknown[] }): string {
  const linhas = new Map<number, { x: number; str: string }[]>();
  for (const raw of content.items) {
    const item = raw as TextItem;
    if (typeof item.str !== "string" || item.str.length === 0) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 3) * 3;
    const x = item.transform?.[4] ?? 0;
    const linha = linhas.get(y) ?? [];
    linha.push({ x, str: item.str });
    linhas.set(y, linha);
  }
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, itens]) =>
      normalizar(
        itens
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join(" "),
      ),
    )
    .filter((l) => l.length > 0)
    .join("\n");
}
