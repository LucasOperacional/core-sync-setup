/**
 * Varredura página a página dos PDFs dos PROTOCOLOS SALVOS para localizar
 * folhas de ponto com HORAS EXTRAS e gerar o arquivo "Folhas_Horas_Extras.pdf".
 *
 * Regras atendidas:
 *  - considera variações de caixa, acentos e espaços ("Horas Extras", "HORA  EXTRA", "H.E.");
 *  - usa OCR (tesseract.js, português) quando a página é digitalizada / sem texto;
 *  - ignora outros motivos (FÉRIAS, ATESTADO, FALTA, ATRASO) — eles nunca entram sozinhos;
 *  - se a página tiver HORAS EXTRAS junto com outro motivo, a página ENTRA;
 *  - preserva a ordem, a qualidade e a formatação originais (cópia da página inteira);
 *  - não recorta linhas nem duplica páginas;
 *  - o PDF original permanece intacto (somente leitura);
 *  - sem ocorrências: nenhum PDF é gerado.
 */
import { supabase } from "@/integrations/supabase/client";
import { PDFDocument } from "pdf-lib";
import { extrairCampos } from "./pdf-ponto";
import { contemHorasExtras, motivosDaPagina, somenteZerado } from "./horas-extras-separar";
import { baixarBytesFolhaPdf as baixarBytes } from "./folhas-pdf-cache";
import { buscarTudoPaginado } from "./supabase-paginacao";

export const NOME_ARQUIVO_HORAS_EXTRAS = "Folhas_Horas_Extras.pdf";
export const MENSAGEM_SEM_HORAS_EXTRAS = "Nenhuma folha com horas extras encontrada";

export type PaginaHoraExtra = {
  protocoloId: string;
  protocoloTitulo: string;
  arquivo: string;
  caminho: string;
  pagina: number;
  colaborador: string;
  matricula: string;
  empresa: string;
  motivos: string[];
  viaOcr: boolean;
};

export type VarreduraHorasExtras = {
  paginas: PaginaHoraExtra[];
  arquivosLidos: number;
  paginasAnalisadas: number;
  paginasComOcr: number;
  arquivosIlegiveis: number;
};

async function carregarPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  try {
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    if (worker?.default) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }
  return pdfjs;
}

/** Linhas da página que caracterizam lançamento de hora extra. */
function linhasComHoraExtra(texto: string): string[] {
  const achados: string[] = [];
  const todas = texto.split(/\r?\n/);
  // Quando o cabeçalho MOTIVO é reconhecido, só o que vem abaixo dele conta.
  const cabecalho = todas.findIndex((l) => /\bMOTIVOS?\b/i.test(l));
  const linhas = cabecalho >= 0 ? todas.slice(cabecalho + 1) : todas;
  for (const bruta of linhas) {
    const linha = bruta.replace(/\s+/g, " ").trim();
    if (!linha) continue;
    if (!contemHorasExtras(linha)) continue;
    if (somenteZerado(linha)) continue;
    achados.push(linha.slice(0, 160));
  }
  // Fallback: termo quebrado entre linhas (ex.: "HORAS" numa linha, "EXTRAS" na outra).
  if (!achados.length) {
    const inteiro = texto.replace(/\s+/g, " ").trim();
    if (contemHorasExtras(inteiro) && !somenteZerado(inteiro)) {
      const m = inteiro.match(/.{0,60}HORAS?\s*EXTRAS?.{0,60}/i);
      achados.push((m?.[0] ?? "HORAS EXTRAS").trim().slice(0, 160));
    }
  }
  return Array.from(new Set(achados));
}

/** Reconhecimento óptico da página (PDF digitalizado, sem camada de texto). */
async function ocrDaPagina(page: any): Promise<string> {
  if (typeof document === "undefined") return "";
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const { recognize } = await import("tesseract.js");
  const { data } = await recognize(canvas, "por");
  return data?.text ?? "";
}

function textoDoConteudo(items: Array<{ str: string; transform: number[] }>): string {
  const linhas = new Map<number, Array<{ x: number; str: string }>>();
  for (const it of items) {
    if (!it?.str?.trim() || !Array.isArray(it.transform)) continue;
    const y = Math.round((it.transform[5] ?? 0) / 3) * 3;
    const arr = linhas.get(y) ?? [];
    arr.push({ x: it.transform[4] ?? 0, str: it.str });
    linhas.set(y, arr);
  }
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, arr]) =>
      arr
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("\n");
}

/** Lista os PDFs vinculados aos protocolos salvos, na ordem de criação. */
async function pdfsDosProtocolos(): Promise<
  Array<{ protocoloId: string; protocoloTitulo: string; arquivo: string; caminho: string }>
> {
  const protocolos = await buscarTudoPaginado<{ id: string; titulo: string; created_at: string }>(
    (inicio, fim) =>
      supabase
        .from("protocolos")
        .select("id, titulo, created_at")
        .order("created_at", { ascending: true })
        .range(inicio, fim),
  );
  if (!protocolos.length) return [];

  const idsValidos = new Set(protocolos.map((p) => p.id));
  const arquivos = (
    await buscarTudoPaginado<{
      protocolo_id: string;
      nome: string;
      caminho: string;
      created_at: string;
    }>((inicio, fim) =>
      supabase
        .from("protocolo_arquivos")
        .select("protocolo_id, nome, caminho, created_at")
        .order("created_at", { ascending: true })
        .range(inicio, fim),
    )
  ).filter((a) => idsValidos.has(a.protocolo_id));

  const titulos = new Map(protocolos.map((p) => [p.id, p.titulo]));
  const vistos = new Set<string>();
  const lista: Array<{
    protocoloId: string;
    protocoloTitulo: string;
    arquivo: string;
    caminho: string;
  }> = [];
  for (const a of arquivos) {
    if (!a.caminho || vistos.has(a.caminho)) continue;
    vistos.add(a.caminho);
    lista.push({
      protocoloId: a.protocolo_id,
      protocoloTitulo: titulos.get(a.protocolo_id) ?? "Protocolo",
      arquivo: a.nome,
      caminho: a.caminho,
    });
  }
  return lista;
}

/** Varre todos os PDFs dos protocolos salvos e devolve as páginas com horas extras. */
export async function varrerFolhasHorasExtras(
  onProgresso?: (mensagem: string) => void,
): Promise<VarreduraHorasExtras> {
  const fontes = await pdfsDosProtocolos();
  const pdfjs = await carregarPdfJs();

  const paginas: PaginaHoraExtra[] = [];
  let paginasAnalisadas = 0;
  let paginasComOcr = 0;
  let arquivosIlegiveis = 0;
  let arquivosLidos = 0;

  for (let i = 0; i < fontes.length; i++) {
    const fonte = fontes[i]!;
    onProgresso?.(`Lendo ${fonte.arquivo} (${i + 1}/${fontes.length})...`);
    const bytes = await baixarBytes(fonte.caminho);
    if (!bytes) {
      arquivosIlegiveis += 1;
      continue;
    }

    let doc: any;
    try {
      doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
    } catch {
      arquivosIlegiveis += 1;
      continue;
    }
    arquivosLidos += 1;

    for (let p = 1; p <= doc.numPages; p++) {
      paginasAnalisadas += 1;
      let texto = "";
      let viaOcr = false;
      let page: any = null;
      let itens: Array<{ str: string; transform: number[] }> = [];
      try {
        page = await doc.getPage(p);
        const content = await page.getTextContent();
        itens = (content?.items ?? []) as Array<{ str: string; transform: number[] }>;
        texto = textoDoConteudo(itens);
      } catch {
        texto = "";
      }

      // Página digitalizada (sem camada de texto legível) → OCR.
      if (page && texto.replace(/\s/g, "").length < 40) {
        onProgresso?.(`OCR na página ${p} de ${fonte.arquivo}...`);
        try {
          const reconhecido = await ocrDaPagina(page);
          if (reconhecido.trim()) {
            texto = reconhecido;
            viaOcr = true;
            paginasComOcr += 1;
          }
        } catch {
          // OCR indisponível — segue com o texto que houver.
        }
      }

      // REGRA: só entram páginas cuja coluna MOTIVO traga HORAS EXTRAS.
      // Qualquer outro motivo (atestado, falta, atraso, férias...) é ignorado.
      const motivos = viaOcr
        ? linhasComHoraExtra(texto)
        : motivosDaPagina(itens).filter((m) => contemHorasExtras(m) && !somenteZerado(m));
      if (!motivos.length) continue;

      const campos = extrairCampos(texto);
      paginas.push({
        protocoloId: fonte.protocoloId,
        protocoloTitulo: fonte.protocoloTitulo,
        arquivo: fonte.arquivo,
        caminho: fonte.caminho,
        pagina: p,
        colaborador: campos.colaborador || "Não identificado",
        matricula: campos.matricula || "",
        empresa: campos.empresa || "",
        motivos,
        viaOcr,
      });
    }

    try {
      await doc.destroy();
    } catch {
      // documento já liberado
    }
  }

  return { paginas, arquivosLidos, paginasAnalisadas, paginasComOcr, arquivosIlegiveis };
}

export type ArquivoHorasExtras = {
  nomeArquivo: string;
  bytes: Uint8Array;
  paginas: number;
};

/**
 * Monta o PDF "Folhas_Horas_Extras.pdf" com as páginas completas encontradas,
 * na ordem original, sem duplicar páginas. Devolve null quando não há nenhuma.
 */
export async function montarFolhasHorasExtrasPdf(
  paginas: PaginaHoraExtra[],
): Promise<ArquivoHorasExtras | null> {
  if (!paginas.length) return null;

  const destino = await PDFDocument.create();
  const origens = new Map<string, PDFDocument>();
  const incluidas = new Set<string>();
  let total = 0;

  for (const item of paginas) {
    const marca = `${item.caminho}#${item.pagina}`;
    if (incluidas.has(marca)) continue;

    let origem = origens.get(item.caminho);
    if (!origem) {
      const bytes = await baixarBytes(item.caminho);
      if (!bytes) continue;
      try {
        origem = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
      } catch {
        continue;
      }
      origens.set(item.caminho, origem);
    }

    const indice = item.pagina - 1;
    if (indice < 0 || indice >= origem.getPageCount()) continue;

    const [copia] = await destino.copyPages(origem, [indice]);
    destino.addPage(copia!);
    incluidas.add(marca);
    total += 1;
  }

  if (!total) return null;
  return {
    nomeArquivo: NOME_ARQUIVO_HORAS_EXTRAS,
    bytes: await destino.save(),
    paginas: total,
  };
}
