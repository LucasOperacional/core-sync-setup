import jsPDF from "jspdf";

export interface DadosMovimentacaoComprovante {
  protocolo: string;
  colaborador: string;
  cargo: string | null;
  postoAtual: string;
  novoPosto: string;
  dataMovimentacao: string;
  motivo: string;
  supervisor: string | null;
  solicitadoEm: string;
}

export interface DadosAssinaturaComprovante {
  nome: string;
  assinadoEm: string;
  ip: string | null;
  latitude: number | null;
  longitude: number | null;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return iso.length === 10 ? d.toLocaleDateString("pt-BR") : d.toLocaleString("pt-BR");
}

/**
 * Gera o comprovante (A4) da assinatura da movimentação de posto, com IP, data/hora
 * e geolocalização do momento em que o colaborador assinou.
 */
export function gerarComprovanteAssinaturaMovimentacao(
  mov: DadosMovimentacaoComprovante,
  assinatura: DadosAssinaturaComprovante,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 18;
  const largura = 210 - margem * 2;
  let y = 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("COMPROVANTE DE ASSINATURA", 105, y, { align: "center" });
  y += 6;
  doc.setFontSize(12);
  doc.text("MOVIMENTAÇÃO DE POSTO", 105, y, { align: "center" });
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Protocolo: ${mov.protocolo}`, 105, y, { align: "center" });
  y += 4;
  doc.setDrawColor(40);
  doc.line(margem, y, 210 - margem, y);
  y += 8;

  const campo = (rotulo: string, valor: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(rotulo, margem, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const linhas = doc.splitTextToSize(valor || "—", largura) as string[];
    doc.text(linhas, margem, y + 4.5);
    y += 4.5 + linhas.length * 4.6 + 3;
  };

  campo("COLABORADOR", mov.colaborador);
  campo("CARGO", mov.cargo ?? "—");
  campo("POSTO ATUAL", mov.postoAtual);
  campo("NOVO POSTO", mov.novoPosto);
  campo("DATA DA MOVIMENTAÇÃO", fmtData(mov.dataMovimentacao));
  campo("MOTIVO", mov.motivo);
  campo(
    "SOLICITADO POR (SUPERVISÃO)",
    `${mov.supervisor ?? "—"} em ${fmtData(mov.solicitadoEm)}`,
  );

  y += 3;
  doc.setDrawColor(120);
  doc.line(margem, y, 210 - margem, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DADOS DA ASSINATURA (AUDITORIA)", margem, y);
  y += 7;

  campo("ASSINADO POR", assinatura.nome || mov.colaborador);
  campo("DATA E HORA DA ASSINATURA", fmtData(assinatura.assinadoEm));
  campo("ENDEREÇO DE ACESSO (IP)", assinatura.ip || "não identificado");
  campo(
    "GEOLOCALIZAÇÃO",
    assinatura.latitude !== null && assinatura.longitude !== null
      ? `${assinatura.latitude.toFixed(6)}, ${assinatura.longitude.toFixed(6)}`
      : "não autorizada pelo aparelho",
  );

  y += 4;
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  const rodape = doc.splitTextToSize(
    `Comprovante gerado eletronicamente em ${new Date().toLocaleString("pt-BR")}. Os dados de data, hora, endereço de acesso e localização foram registrados no momento da assinatura para fins de auditoria (MP 2.200-2/2001, art. 10, §2º).`,
    largura,
  ) as string[];
  doc.text(rodape, margem, Math.max(y, 275));
  doc.setTextColor(0);
  return doc;
}
