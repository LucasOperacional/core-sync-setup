import jsPDF from "jspdf";
import type { CrtLancamento } from "./crt-lancamentos.functions";
import { CRT_LOGO_JPEG_BASE64 } from "./crt-logo";

/** Cabeçalho oficial do formulário (logo + identificação + código/revisão/data). */
function desenharCabecalho(doc: jsPDF, x: number, y: number, w: number): number {
  const h = 24;
  const c1 = x + w * 0.3;
  const c2 = x + w * 0.78;

  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  doc.line(c1, y, c1, y + h);
  doc.line(c2, y, c2, y + h);

  try {
    doc.addImage(CRT_LOGO_JPEG_BASE64, "JPEG", x + 4, y + 4, w * 0.3 - 8, h - 8);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("TEKTRON", x + w * 0.15, y + h / 2 + 2, { align: "center" });
  }

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text("Tipo de Documento", c1 + 4, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Registro", c1 + 45, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Título", c1 + 4, y + 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("CONTROLE DE RESERVA TÉCNICA", c1 + 24, y + 17);

  const rw = x + w - c2;
  doc.setLineWidth(0.3);
  doc.line(c2, y + h / 3, x + w, y + h / 3);
  doc.line(c2, y + (h * 2) / 3, x + w, y + (h * 2) / 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("Código", c2 + 2, y + 3.5);
  doc.text("Revisão", c2 + 2, y + h / 3 + 3.5);
  doc.text("Data Aprovação", c2 + 2, y + (h * 2) / 3 + 3.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("RE.OPE.14-CRT-", c2 + rw / 2, y + h / 3 - 1.5, { align: "center" });
  doc.text("Rev.00", c2 + rw / 2, y + (h * 2) / 3 - 1.5, { align: "center" });
  doc.text("08/07/2020", c2 + rw / 2, y + h - 2, { align: "center" });

  return y + h;
}

function fmtData(iso: string | null): string {
  if (!iso) return "____/____/______";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "____/____/______";
  return d.toLocaleDateString("pt-BR");
}

function fmtHora(iso: string | null): string {
  if (!iso) return "______";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "______";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Desenha o formulário CRT em uma página de altura informada e retorna o
 * documento junto com a posição final do conteúdo (mm), para medição.
 */
function desenharFormulario(
  crt: CrtLancamento,
  alturaPaginaMm: number,
): { doc: jsPDF; fimMm: number } {
  // jsPDF trata o array de formato como [altura, largura] na orientação paisagem.
  const doc = new jsPDF({ unit: "mm", orientation: "l", format: [alturaPaginaMm, 210] });
  const M = 18;
  const W = 210 - M * 2;
  const L = M + 4;
  const R = M + W - 4;
  const yTop = desenharCabecalho(doc, M, 14, W) + 6;
  let y = yTop + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);

  const titulo = (texto: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const cx = M + W / 2;
    doc.text(texto, cx, y, { align: "center" });
    const w = doc.getTextWidth(texto);
    doc.setLineWidth(0.3);
    doc.line(cx - w / 2, y + 1.2, cx + w / 2, y + 1.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    y += 9;
  };

  const campo = (label: string, valor: string, fim = R) => {
    doc.setFont("helvetica", "normal");
    doc.text(label, L, y);
    const x = L + doc.getTextWidth(label) + 1.5;
    doc.setFont("helvetica", "bold");
    doc.text(valor || "", x + 1, y);
    doc.setFont("helvetica", "normal");
    doc.setLineWidth(0.2);
    doc.line(x, y + 1.2, fim, y + 1.2);
    y += 9;
  };

  titulo("DADOS DA SUBSTITUIDO");

  {
    let x = L + 4;
    const parte = (rotulo: string, valor: string, largura: number) => {
      doc.setFont("helvetica", "normal");
      doc.text(rotulo, x, y);
      const xv = x + doc.getTextWidth(rotulo) + 1.5;
      doc.setFont("helvetica", "bold");
      doc.text(valor, xv + 1, y);
      doc.setFont("helvetica", "normal");
      doc.setLineWidth(0.2);
      doc.line(xv, y + 1.2, x + largura, y + 1.2);
      x += largura + 3;
    };
    parte("DATA", fmtData(crt.inicio), 38);
    parte("HORA", fmtHora(crt.inicio), 28);
    parte("às", fmtHora(crt.fim), 20);
    doc.text("SUPERVISOR RESPONSÁVEL:", x, y);
    const xs = x + doc.getTextWidth("SUPERVISOR RESPONSÁVEL:") + 1.5;
    doc.setFont("helvetica", "bold");
    doc.text(crt.supervisor || "", xs + 1, y);
    doc.setFont("helvetica", "normal");
    doc.line(xs, y + 1.2, R, y + 1.2);
    y += 10;
  }

  campo("Nome do colaborador (Faltoso/Substituido):", crt.colaborador || "");
  campo("Posto de Serviço:", crt.posto_nome || "");

  {
    doc.text("Motivo:", L, y);
    const x0 = L + doc.getTextWidth("Motivo:") + 1.5;
    doc.setFont("helvetica", "bold");
    const linhas: string[] = doc.splitTextToSize(crt.motivo || "", R - x0);
    const total = Math.max(1, linhas.length);
    for (let i = 0; i < total; i += 1) {
      const xi = i === 0 ? x0 : L;
      if (linhas[i]) doc.text(linhas[i] as string, xi + 1, y + i * 8);
      doc.setLineWidth(0.2);
      doc.line(xi, y + i * 8 + 1.2, R, y + i * 8 + 1.2);
    }
    doc.setFont("helvetica", "normal");
    y += total * 8 + 4;
  }

  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(L + 6, y, R, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  const yDiv = y;
  y += 7;

  titulo("DADOS DA RESERVA/SUBSTITUTO");

  campo("Nome completo do colaborador (substituto)", crt.substituto || "");

  const norm = (v: string) =>
    (v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const marca = (valor: string, alvo: "sim" | "nao") => (norm(valor) === alvo ? "X" : " ");
  const vt = crt.recebeu_vt || "";
  const ref = crt.recebeu_refeicao || "";

  doc.text(`Recebeu V.T: ( ${marca(vt, "sim")} )sim   ( ${marca(vt, "nao")} )não`, L, y);
  doc.text(
    `Recebeu refeição:   ( ${marca(ref, "sim")} )sim   ( ${marca(ref, "nao")} )não`,
    L + 80,
    y,
  );
  y += 9;

  {
    doc.text("Valor a receber: R$", L, y);
    const xv = L + doc.getTextWidth("Valor a receber: R$") + 1.5;
    const fimValor = R - 62;
    doc.setFont("helvetica", "bold");
    doc.text(crt.valor_receber || "", xv + 1, y);
    doc.setFont("helvetica", "normal");
    doc.setLineWidth(0.2);
    doc.line(xv, y + 1.2, fimValor, y + 1.2);

    doc.text("recebido em", fimValor + 4, y);
    const xd = fimValor + 4 + doc.getTextWidth("recebido em") + 1.5;
    doc.setFont("helvetica", "bold");
    doc.text(fmtData(crt.recebido_em), xd + 1, y);
    doc.setFont("helvetica", "normal");
    doc.line(xd, y + 1.2, R, y + 1.2);
    y += 9;
  }

  {
    const label = "Assinatura do Colaborador:";
    const x = L + doc.getTextWidth(label) + 1.5;
    const assinatura = crt.assinatura_colaborador || "";
    if (assinatura.startsWith("data:image/")) {
      const alturaImg = 14;
      const larguraImg = Math.min(60, R - x - 2);
      try {
        doc.addImage(assinatura, "PNG", x + 2, y - alturaImg + 2.5, larguraImg, alturaImg);
      } catch {
        /* imagem inválida: deixa a linha em branco */
      }
    }
    campo(label, "");
  }
  campo("Assinatura do Supervisor que efetuou o pagamento:", "");

  const hTotal = y - yTop;
  doc.setLineWidth(0.2);
  doc.rect(M, yTop, W, hTotal);
  doc.line(M, yDiv, M + W, yDiv);

  return { doc, fimMm: yTop + hTotal };
}

/**
 * Gera o PDF do CRT exatamente no layout do formulário oficial (cabeçalho
 * TEKTRON + blocos "DADOS DA SUBSTITUIDO" e "DADOS DA RESERVA/SUBSTITUTO"),
 * com a página no tamanho exato do formulário — sem folha A4 vazia em volta.
 */
export function gerarDocPdfCrt(crt: CrtLancamento): jsPDF {
  // Primeira passada só mede a altura ocupada pelo conteúdo.
  const { fimMm } = desenharFormulario(crt, 297);
  // Segunda passada desenha em uma página com a altura exata do formulário.
  return desenharFormulario(crt, Math.max(120, fimMm + 12)).doc;
}

/** Baixa o formulário CRT preenchido em PDF. */
export function gerarPdfCrt(crt: CrtLancamento): void {
  const nome = (crt.colaborador || "reserva_tecnica").replace(/[^\w]+/g, "_").slice(0, 40);
  gerarDocPdfCrt(crt).save(`CRT_${nome || "reserva_tecnica"}.pdf`);
}

/** Abre o formulário CRT preenchido em uma nova aba. */
export function abrirPdfCrt(crt: CrtLancamento): void {
  const url = gerarDocPdfCrt(crt).output("bloburl");
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Exporta vários CRTs em um único PDF, com 2 formulários por página A4
 * (um na metade superior e outro na metade inferior, separados por linha).
 */
export async function exportarPdfsCrtEmLote(crts: CrtLancamento[]): Promise<void> {
  if (crts.length === 0) return;
  const { PDFDocument } = await import("pdf-lib");

  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGEM = 8;
  const FOLGA_LINHA = 3;
  const meia = A4_H / 2;

  const destino = await PDFDocument.create();

  for (let i = 0; i < crts.length; i += 2) {
    const pagina = destino.addPage([A4_W, A4_H]);
    const par = [crts[i], crts[i + 1]].filter(Boolean) as CrtLancamento[];

    for (let slot = 0; slot < par.length; slot += 1) {
      const bytes = gerarDocPdfCrt(par[slot] as CrtLancamento).output("arraybuffer");
      const origem = await PDFDocument.load(bytes);
      const [emb] = await destino.embedPdf(origem, [0]);
      if (!emb) continue;
      // Cada formulário se expande até a linha do meio: a escala usa a
      // metade da folha como limite, encostando um layout na linha central.
      const escala = Math.min(
        (A4_W - MARGEM * 2) / emb.width,
        (meia - MARGEM - FOLGA_LINHA) / emb.height,
      );
      const w = emb.width * escala;
      const h = emb.height * escala;
      const x = (A4_W - w) / 2;
      const y =
        slot === 0
          ? meia + FOLGA_LINHA + (meia - MARGEM - FOLGA_LINHA - h)
          : meia - FOLGA_LINHA - h;
      pagina.drawPage(emb, { x, y, width: w, height: h });
    }

    // linha separando os dois lançamentos
    pagina.drawLine({
      start: { x: MARGEM, y: meia },
      end: { x: A4_W - MARGEM, y: meia },
      thickness: 0.8,
    });
  }

  const final = await destino.save();
  const blob = new Blob([final as unknown as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `CRT_todos_${hoje}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
