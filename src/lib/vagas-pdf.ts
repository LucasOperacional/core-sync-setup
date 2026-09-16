import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import modeloUrl from "@/assets/template-solicitacao-pessoas.pdf?url";
import type { SolicitacaoVaga } from "@/lib/vagas-template";

const ALTURA = 841.889764;

/** Converte coordenada "de cima para baixo" (como no layout do modelo) para o eixo do PDF. */
function yDe(topo: number) {
  return ALTURA - topo;
}

type Ctx = { page: PDFPage; font: PDFFont; bold: PDFFont };

function texto(ctx: Ctx, valor: string, x: number, topo: number, size = 9) {
  const v = String(valor ?? "").trim();
  if (!v) return;
  ctx.page.drawText(v, { x, y: yDe(topo), size, font: ctx.font, color: rgb(0, 0, 0) });
}

/** Sobrepõe um rótulo pré-impresso no template com a versão em negrito. */
function rotuloNegrito(
  ctx: Ctx,
  textoLabel: string,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
  size = 9.5,
) {
  const padding = 0.6;
  const w = xMax - xMin + padding * 2;
  const h = yMax - yMin;
  const x = xMin - padding;
  const y = yDe(yMax) + 0.4;

  // Apaga o texto original com um retângulo branco, sem tocar as linhas da célula.
  ctx.page.drawRectangle({
    x,
    y,
    width: w,
    height: Math.max(h - 1.2, 1),
    color: rgb(1, 1, 1),
    borderColor: rgb(1, 1, 1),
    borderWidth: 0,
  });

  // Redesenha o rótulo em negrito centralizado na área do rótulo original,
  // com a baseline apoiada na base do texto (sem invadir as linhas do formulário).
  const larguraTexto = ctx.bold.widthOfTextAtSize(textoLabel, size);
  const xCentro = xMin + (xMax - xMin - larguraTexto) / 2;
  ctx.page.drawText(textoLabel, {
    x: Math.max(xMin, xCentro),
    y: yDe(yMax) + size * 0.22,
    size,
    font: ctx.bold,
    color: rgb(0, 0, 0),
  });
}

/** Sobrepõe um rótulo pré-impresso de múltiplas linhas no template com a versão em negrito. */
function rotuloNegritoMultilinha(
  ctx: Ctx,
  textoLabel: string,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
  size = 9,
) {
  const padding = 0.6;
  const w = xMax - xMin + padding * 2;
  const h = yMax - yMin;
  const x = xMin - padding;
  const y = yDe(yMax) + 0.4;

  // Apaga o texto original com um retângulo branco, sem tocar as linhas da célula.
  ctx.page.drawRectangle({
    x,
    y,
    width: w,
    height: Math.max(h - 1.2, 1),
    color: rgb(1, 1, 1),
    borderColor: rgb(1, 1, 1),
    borderWidth: 0,
  });

  // Redesenha o rótulo em negrito, quebrando em linhas e centralizando na área.
  const larguraUtil = Math.max(xMax - xMin - padding * 2, 10);
  const linhas = quebrar(ctx.bold, textoLabel, larguraUtil, size);
  const espacamento = size + 1.5;
  const alturaTotal = linhas.length * espacamento - 1.5;
  let topoAtual = yMin + (h - alturaTotal) / 2;

  for (const linha of linhas) {
    const larguraTexto = ctx.bold.widthOfTextAtSize(linha, size);
    const xCentro = xMin + (xMax - xMin - larguraTexto) / 2;
    ctx.page.drawText(linha, {
      x: Math.max(xMin, xCentro),
      y: yDe(topoAtual),
      size,
      font: ctx.bold,
      color: rgb(0, 0, 0),
    });
    topoAtual += espacamento;
  }
}

function marcarX(ctx: Ctx, x: number, topo: number) {
  ctx.page.drawText("X", { x, y: yDe(topo), size: 9, font: ctx.bold, color: rgb(0, 0, 0) });
}

function quebrar(font: PDFFont, valor: string, largura: number, size: number) {
  const linhas: string[] = [];
  for (const paragrafo of String(valor ?? "").split(/\r?\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (font.widthOfTextAtSize(teste, size) > largura && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = teste;
      }
    }
    linhas.push(atual);
  }
  return linhas.filter((l) => l.length > 0);
}

function blocoTexto(
  ctx: Ctx,
  valor: string,
  x: number,
  topo: number,
  largura: number,
  maxLinhas: number,
  size = 9,
) {
  const linhas = quebrar(ctx.font, valor, largura, size).slice(0, maxLinhas);
  linhas.forEach((linha, i) => texto(ctx, linha, x, topo + i * (size + 2.5), size));
}

/** Sanitiza para o conjunto WinAnsi usado pelas fontes padrão do PDF. */
function limpar(valor: string) {
  return String(valor ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function normalizarDados(dados: SolicitacaoVaga): SolicitacaoVaga {
  const copia = { ...dados } as Record<string, unknown>;
  for (const [k, v] of Object.entries(copia)) {
    if (typeof v === "string") copia[k] = limpar(v);
  }
  return copia as unknown as SolicitacaoVaga;
}

function dataBr(valor: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor ?? "");
}

/** Preenche o modelo oficial RE.DRU.03-SDP- (Solicitação de Pessoas) com os dados do formulário. */
export async function gerarPdfSolicitacaoVaga(entrada: SolicitacaoVaga): Promise<Uint8Array> {
  const dados = normalizarDados(entrada);
  const bytes = await fetch(modeloUrl).then((r) => r.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPages()[0]!;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { page, font, bold };

  // Sobrepõe os rótulos do template com versões em negrito.
  rotuloNegrito(ctx, "Cargo:", 39.45, 136.38, 68.27, 149.8);
  rotuloNegrito(
    ctx,
    "Nome do candidato (Para uso exclusivo do RH):",
    308.45,
    136.38,
    522.58,
    149.8,
  );
  rotuloNegrito(ctx, "Colaborador Substituído:", 39.45, 191.18, 150.91, 204.6);
  rotuloNegrito(ctx, "Justificativa:", 39.45, 227.48, 94.15, 240.9);
  rotuloNegrito(ctx, "Depto/ Posto:", 39.45, 301.28, 101.82, 314.7);
  rotuloNegrito(ctx, "Localidade/Ponto de referência:", 351.35, 301.28, 494.64, 314.7);
  rotuloNegrito(ctx, "Descrição da atividade:", 39.45, 512.83, 123.98, 523.81);
  rotuloNegrito(ctx, "Fiscal com quem o funcionário vai trabalhar:", 39.45, 667.03, 237.32, 680.45);
  rotuloNegrito(ctx, "Quem está solicitando:", 282.1, 667.03, 384.68, 680.45);
  rotuloNegrito(ctx, "Data:", 397.25, 667.03, 421.12, 680.45);
  rotuloNegrito(ctx, "Coordenador Operacional:", 39.45, 703.23, 157.92, 716.65);
  rotuloNegrito(ctx, "Horário de trabalho:", 39.45, 474.45, 130.33, 485.45);
  rotuloNegritoMultilinha(
    ctx,
    "Descrição de requisitos solicitados para o perfil da vaga, de acordo com as exigências do cliente.",
    40.85,
    612.33,
    147.56,
    658.93,
  );

  // Dados da solicitação
  texto(ctx, dados.cargo, 42, 163);
  blocoTexto(ctx, dados.nomeCandidato, 310, 163, 212, 1);

  if (dados.tipoSolicitacao === "aumento") {
    // cobre o (X) impresso em "Reposição de Vaga" e marca "Aumento do Quadro"
    page.drawRectangle({
      x: 127.5,
      y: yDe(188.5),
      width: 8,
      height: 15.5,
      color: rgb(1, 1, 1),
    });
    marcarX(ctx, 391.5, 184);
  }

  texto(ctx, dados.colaboradorSubstituido, 42, 215);
  blocoTexto(ctx, dados.justificativa, 42, 252, 505, 4);

  // Identificação da vaga
  blocoTexto(ctx, dados.departamentoPosto, 42, 327, 225, 2);
  if (dados.sexo === "fem") marcarX(ctx, 283.6, 325);
  if (dados.sexo === "masc") marcarX(ctx, 283.6, 338.5);
  if (dados.sexo === "indiferente") texto(ctx, "( X ) INDIFERENTE", 280.4, 346.5, 7.5);
  blocoTexto(ctx, dados.localidade, 352, 326, 190, 2, 8);

  // Salário e benefícios
  if (dados.salario.trim()) marcarX(ctx, 53.2, 380);
  texto(ctx, dados.salario, 102, 380);
  if (dados.valeAlimentacao) marcarX(ctx, 53.2, 400);
  if (dados.valeTransporte.trim()) marcarX(ctx, 176.5, 400);
  texto(ctx, dados.valeTransporte, 214, 400);
  if (dados.planoSaude) marcarX(ctx, 53.2, 420);
  if (dados.planoOdontologico) marcarX(ctx, 164.5, 420);
  if (dados.gratificacao.trim()) marcarX(ctx, 53.2, 440);
  texto(ctx, dados.gratificacao, 126, 440);
  if (dados.outrosBeneficios.trim()) marcarX(ctx, 53.2, 460.5);
  texto(ctx, dados.outrosBeneficios, 106, 460.5);

  blocoTexto(ctx, dados.horarioTrabalho, 135, 483, 290, 1);
  texto(ctx, dataBr(dados.dataInicio), 437, 497);
  blocoTexto(ctx, dados.descricaoAtividade, 42, 536, 505, 9);

  // Perfil desejado
  blocoTexto(ctx, dados.perfilDesejado, 175, 620, 370, 4);

  // Responsáveis
  blocoTexto(ctx, dados.fiscalResponsavel, 42, 692, 230, 1);
  blocoTexto(ctx, dados.solicitante, 282, 692, 105, 1);
  texto(ctx, dataBr(dados.dataSolicitacao), 397, 692);
  texto(ctx, dados.coordenadorOperacional, 42, 728);

  return pdf.save();
}

export function nomeArquivoSolicitacao(dados: SolicitacaoVaga) {
  const slug = (dados.cargo || "vaga")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
  return `SOLICITACAO_DE_PESSOAS_${slug}.pdf`;
}

export async function baixarPdfSolicitacaoVaga(dados: SolicitacaoVaga): Promise<string> {
  const bytes = await gerarPdfSolicitacaoVaga(dados);
  const nome = nomeArquivoSolicitacao(dados);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return nome;
}
