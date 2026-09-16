import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FolhaPonto } from "./pdf-ponto";

export type DadosProtocoloPdf = {
  titulo?: string | undefined;
  empresa?: string | null | undefined;
  responsavel?: string | undefined;
  data?: string | undefined;
  folhas: FolhaPonto[];
};

/** Gera o PDF do protocolo mantendo a ordem original das folhas. */
export function gerarProtocoloPdf(dados: DadosProtocoloPdf): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(dados.titulo?.trim() || "Protocolo de folhas de ponto", 40, 45);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const linhas: string[] = [];
  if (dados.responsavel) linhas.push(`Responsável: ${dados.responsavel}`);
  const agora = new Date();
  const dataHora =
    dados.data ||
    agora.toLocaleDateString("pt-BR") +
      " " +
      agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  linhas.push(`Data e hora: ${dataHora}`);
  linhas.push(`Total de folhas: ${dados.folhas.length}`);

  doc.text(linhas.join("   |   "), 40, 62);

  autoTable(doc, {
    startY: 78,
    margin: { bottom: 110 },
    styles: { fontSize: 8, cellPadding: 4, lineWidth: 0.4, lineColor: [210, 210, 210] },
    headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 32, halign: "center" },
      3: { cellWidth: 120 },
    },
    head: [["#", "Colaborador", "Empresa", "Cargo"]],
    body: dados.folhas.map((f, i) => [
      String(f.ordem || i + 1),
      f.colaborador || "—",
      f.empresa || "—",
      f.cargo || "—",
    ]),
    didDrawPage: () => {
      const pagina = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${pagina}`, largura - 40, doc.internal.pageSize.getHeight() - 18, {
        align: "right",
      });
      doc.setTextColor(0);
    },
  });

  // Assinatura posicionada logo abaixo do último nome do protocolo
  const finalY = (doc as any).lastAutoTable?.finalY ?? 78;
  const altura = doc.internal.pageSize.getHeight();
  const centroX = largura / 2;
  const espacoParagrafo = 14;
  let linhaY = finalY + espacoParagrafo * 2 + 10;

  // Garante que a assinatura caiba na página; se não couber, cria nova página
  if (linhaY + 50 > altura - 30) {
    doc.addPage();
    linhaY = 80;
  }

  // Linha de assinatura de quem está recebendo
  doc.setDrawColor(60);
  doc.setLineWidth(0.8);
  doc.line(centroX - 130, linhaY, centroX + 130, linhaY);

  // Ícone de visto (✓) embaixo da assinatura
  const cx = centroX - 24;
  const cy = linhaY + 18;
  doc.setDrawColor(0);
  doc.setLineWidth(1.2);
  doc.line(cx, cy, cx + 3.5, cy + 3.5);
  doc.line(cx + 3.5, cy + 3.5, cx + 9, cy - 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text("Visto", cx + 13, cy + 3);
  doc.setTextColor(60);
  doc.text("Assinatura de quem recebeu", centroX, linhaY + 34, { align: "center" });
  doc.setTextColor(0);

  return doc;
}

export function baixarProtocoloPdf(dados: DadosProtocoloPdf) {
  const nome = (dados.titulo?.trim() || "protocolo-folhas-de-ponto")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  gerarProtocoloPdf(dados).save(`${nome || "protocolo"}.pdf`);
}

/** Abre o PDF do protocolo em uma nova aba, pronto para consulta/impressão. */
export function abrirProtocoloPdf(dados: DadosProtocoloPdf) {
  const url = gerarProtocoloPdf(dados).output("bloburl");
  window.open(url, "_blank", "noopener,noreferrer");
}
