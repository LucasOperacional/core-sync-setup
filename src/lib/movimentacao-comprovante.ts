import jsPDF from "jspdf";
import type { MovimentacaoPosto } from "@/lib/movimentacao-posto.functions";
import { gerarMatrizQr, matrizParaSvg } from "@/lib/assinatura/qr";

const STATUS_LABEL: Record<MovimentacaoPosto["status"], string> = {
  pendente: "PENDENTE DE AUTORIZAÇÃO",
  aprovada: "APROVADA E ENVIADA À NEXTI",
  recusada: "RECUSADA",
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : iso.length === 10
      ? d.toLocaleDateString("pt-BR")
      : d.toLocaleString("pt-BR");
}

export function urlValidacaoMovimentacao(protocolo: string): string {
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  return `${origem}/validar-movimentacao?p=${encodeURIComponent(protocolo)}`;
}

async function qrComoPng(conteudo: string, tamanhoPx = 300): Promise<string | null> {
  try {
    const matriz = await gerarMatrizQr(conteudo);
    const svg = matrizParaSvg(matriz, tamanhoPx);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("QR"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = tamanhoPx;
    canvas.height = tamanhoPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tamanhoPx, tamanhoPx);
    ctx.drawImage(img, 0, 0, tamanhoPx, tamanhoPx);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Gera o comprovante de movimentação de posto (A4) com QR Code e assinatura do colaborador. */
export async function gerarComprovanteMovimentacao(mov: MovimentacaoPosto): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 18;
  const largura = 210 - margem * 2;
  let y = 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("COMPROVANTE DE MOVIMENTAÇÃO DE POSTO", 105, y, { align: "center" });
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Protocolo: ${mov.protocolo}`, 105, y, { align: "center" });
  y += 4;
  doc.setDrawColor(40);
  doc.line(margem, y, 210 - margem, y);
  y += 8;

  const urlValidacao = urlValidacaoMovimentacao(mov.protocolo);
  const qr = await qrComoPng(urlValidacao);
  const ladoQr = 38;
  const xQr = 210 - margem - ladoQr;
  if (qr) {
    doc.addImage(qr, "PNG", xQr, y, ladoQr, ladoQr);
    doc.setFontSize(7);
    doc.text("Aponte a câmera para validar", xQr + ladoQr / 2, y + ladoQr + 4, { align: "center" });
  }

  const larguraTexto = largura - ladoQr - 8;
  const campo = (rotulo: string, valor: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(rotulo, margem, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const linhas = doc.splitTextToSize(valor || "—", larguraTexto) as string[];
    doc.text(linhas, margem, y + 4.5);
    y += 4.5 + linhas.length * 4.6 + 3;
  };

  campo("STATUS", STATUS_LABEL[mov.status]);
  campo("COLABORADOR", mov.colaborador);
  campo("CARGO (NEXTI)", mov.cargo ?? "—");
  campo("POSTO ATUAL", mov.posto_atual);
  campo("NOVO POSTO", mov.novo_posto);
  campo("DATA DA MOVIMENTAÇÃO", fmtData(mov.data_movimentacao));
  y = Math.max(y, 22 + 19 + ladoQr + 12);
  campo("MOTIVO", mov.motivo);
  if (mov.validacao_detalhe) campo("VALIDAÇÃO DE VAGA (NEXTI)", mov.validacao_detalhe);
  campo(
    "SOLICITADO POR (SUPERVISÃO)",
    `${mov.criado_por_nome ?? "—"} em ${fmtData(mov.created_at)}`,
  );
  if (mov.status !== "pendente") {
    campo(
      mov.status === "aprovada" ? "AUTORIZADO POR (COORDENAÇÃO)" : "RECUSADO POR (COORDENAÇÃO)",
      `${mov.aprovado_por_nome ?? "—"} em ${fmtData(mov.aprovado_em)}`,
    );
  }
  if (mov.status === "aprovada") {
    campo(
      "CONFIRMAÇÃO NEXTI",
      `Transferência nº ${mov.nexti_transfer_id ?? "—"} enviada em ${fmtData(mov.enviado_nexti_em)}`,
    );
  }
  if (mov.status === "recusada" && mov.motivo_recusa) campo("MOTIVO DA RECUSA", mov.motivo_recusa);

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ASSINATURA DO COLABORADOR", margem, y);
  y += 3;
  const altAss = 32;
  doc.setDrawColor(120);
  doc.rect(margem, y, 90, altAss);
  if (mov.assinatura_colaborador?.startsWith("data:image/png")) {
    try {
      doc.addImage(mov.assinatura_colaborador, "PNG", margem + 3, y + 2, 84, altAss - 4);
    } catch {
      // Sem assinatura desenhada, mantém o quadro em branco.
    }
  }
  y += altAss + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(mov.colaborador, margem, y);
  y += 10;

  doc.setFontSize(7.5);
  doc.setTextColor(90);
  const rodape = doc.splitTextToSize(
    `Validação de autenticidade: ${urlValidacao}. Comprovante gerado eletronicamente em ${new Date().toLocaleString("pt-BR")}.`,
    largura,
  ) as string[];
  doc.text(rodape, margem, Math.max(y, 270));
  doc.setTextColor(0);
  return doc;
}

export async function baixarComprovanteMovimentacao(mov: MovimentacaoPosto): Promise<void> {
  const doc = await gerarComprovanteMovimentacao(mov);
  doc.save(`Comprovante_${mov.protocolo}.pdf`);
}
