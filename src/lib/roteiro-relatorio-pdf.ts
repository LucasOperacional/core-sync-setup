import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PerguntaRoteiro, RespostaValor } from "./roteiro-campo-perguntas";
import { formatarCoordenadas, formatarDataHora, type FotoChecklist } from "./foto-carimbo";

export type DadosRelatorioRoteiro = {
  dataVisita: string;
  posto: string;
  cliente: string;
  empresa: string;
  funcao: string;
  colaborador: string;
  supervisor: string;
  perguntas: PerguntaRoteiro[];
  respostas: Record<string, RespostaValor>;
  observacoes: Record<string, string>;
  observacaoGeral: string;
  planoAcao: string;
  resumo: {
    conformes: number;
    naoConformes: number;
    naoAplicaveis: number;
    criticasAbertas: number;
    percentual: number;
  };
  fotos: FotoChecklist[];
  iniciadoEm?: number | null;
  finalizadoEm?: number;
  duracaoSegundos?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  endereco?: string;
};

const ROTULO_RESPOSTA: Record<RespostaValor, string> = {
  conforme: "CONFORME",
  nao_conforme: "NÃO CONFORME",
  na: "NÃO APLICÁVEL",
};

function dataBr(iso: string) {
  const partes = iso.split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : iso;
}

function extensoDuracao(totalSegundos: number | null | undefined): string {
  if (totalSegundos == null) return "—";
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  const partes = [];
  if (h > 0) partes.push(`${h}h`);
  if (m > 0 || h > 0) partes.push(`${m}m`);
  partes.push(`${s}s`);
  return partes.join(" ");
}

/** Monta o relatório em PDF da visita de campo e devolve o conteúdo em base64. */
export function gerarRelatorioRoteiroPdf(dados: DadosRelatorioRoteiro): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margins = { top: 35, bottom: 25, left: 15, right: 15 };
  
  let y = margins.top;

  const getCorConformidade = (p: number): [number, number, number] => {
    if (p === 100) return [22, 163, 74];    // green-600
    if (p >= 80) return [234, 179, 8];      // yellow-500
    return [220, 38, 38];                   // red-600
  };
  const corStatus = getCorConformidade(dados.resumo.percentual);

  // --- INFORMAÇÕES GERAIS ---
  autoTable(doc, {
    startY: y,
    theme: "plain",
    margin: { top: margins.top, bottom: margins.bottom, left: margins.left, right: margins.right },
    styles: { fontSize: 9, cellPadding: 1, textColor: [71, 85, 105] },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [30, 58, 138], cellWidth: 35 },
      1: { cellWidth: 55, textColor: [15, 23, 42] },
      2: { fontStyle: "bold", textColor: [30, 58, 138], cellWidth: 35 },
      3: { cellWidth: "auto", textColor: [15, 23, 42] }
    },
    body: [
      ["Posto Avaliado:", dados.posto || "—", "Supervisor:", dados.supervisor || "—"],
      ["Endereço:", dados.endereco || "Não registrado", "Data da Visita:", dataBr(dados.dataVisita)],
      ["Localização:", (dados.latitude && dados.longitude) ? `${dados.latitude.toFixed(6)}, ${dados.longitude.toFixed(6)}` : "Não registrada", "Início:", dados.iniciadoEm ? formatarDataHora(new Date(dados.iniciadoEm).toISOString()) : "—"],
      ["Função Avaliada:", dados.funcao, "Encerramento:", dados.finalizadoEm ? formatarDataHora(new Date(dados.finalizadoEm).toISOString()) : "—"],
      ["Colaborador:", dados.colaborador || "—", "Duração:", extensoDuracao(dados.duracaoSegundos)]
    ]
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // --- PAINEL DE CONFORMIDADE ---
  doc.setFillColor(...corStatus);
  doc.roundedRect(margins.left, y, pageWidth - margins.left - margins.right, 20, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(`${dados.resumo.percentual}%`, margins.left + 8, y + 14);
  
  doc.setFontSize(10);
  doc.text("ÍNDICE DE CONFORMIDADE DA VISITA", margins.left + 40, y + 9);
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const textoMesa = `Conformes: ${dados.resumo.conformes}   |   Não conformes: ${dados.resumo.naoConformes}   |   N/A: ${dados.resumo.naoAplicaveis}   |   Críticos em aberto: ${dados.resumo.criticasAbertas}`;
  doc.text(textoMesa, margins.left + 40, y + 15);
  
  y += 28;

  // --- CHECKLIST ---
  const tBody = [];
  let blocoAtual = "";
  
  dados.perguntas.forEach((p, i) => {
    if (p.bloco !== blocoAtual) {
      tBody.push([
        { content: p.bloco.toUpperCase(), colSpan: 3, styles: { fillColor: [241, 245, 249], textColor: [30, 58, 138], fontStyle: "bold", halign: "center" } }
      ]);
      blocoAtual = p.bloco;
    }

    const resposta = dados.respostas[p.id];
    const rText = resposta ? ROTULO_RESPOSTA[resposta] : "SEM RESP.";
    let rColor: [number, number, number] = [15, 23, 42];
    if (resposta === "conforme") rColor = [22, 163, 74];
    else if (resposta === "nao_conforme") rColor = [220, 38, 38];
    else if (resposta === "na") rColor = [156, 163, 175];

    const criticaTag = p.critica ? " [CRÍTICO]" : "";
    let itemContent = `${p.texto}${criticaTag}`;
    const obs = dados.observacoes[p.id];
    if (obs?.trim()) {
       itemContent += `\n\n📌 Obs: ${obs.trim()}`;
    }

    tBody.push([
      { content: (i + 1).toString(), styles: { fontStyle: "bold" } },
      itemContent,
      { content: rText, styles: { textColor: rColor, fontStyle: "bold" } }
    ]);
  });

  autoTable(doc, {
    startY: y,
    margin: { top: margins.top, bottom: margins.bottom, left: margins.left, right: margins.right },
    head: [["#", "Item Avaliado (Checklist)", "Status"]],
    body: tBody,
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3, lineColor: [226, 232, 240] },
    columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 35, halign: "center", valign: "middle" }
    },
    pageBreak: "auto"
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // --- OBSERVAÇÕES E PLANO GERAL ---
  if (dados.observacaoGeral?.trim() || dados.planoAcao?.trim()) {
     autoTable(doc, {
       startY: y,
       margin: { top: margins.top, bottom: margins.bottom, left: margins.left, right: margins.right },
       body: [
         [{ content: "OBSERVAÇÕES GERAIS DA VISITA", styles: { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [30, 58, 138] } }],
         [dados.observacaoGeral?.trim() || "Nenhuma observação registrada."],
         [{ content: "PLANO DE AÇÃO E PRAZOS", styles: { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [30, 58, 138], marginTop: 5 } }],
         [dados.planoAcao?.trim() || "Nenhum plano de ação registrado."]
       ],
       theme: "grid",
       styles: { fontSize: 9, cellPadding: 4, lineColor: [226, 232, 240] },
       pageBreak: "auto"
     });
     y = (doc as any).lastAutoTable.finalY + 10;
  }

  // --- REGISTRO FOTOGRÁFICO ---
  if (dados.fotos.length > 0) {
      doc.addPage();
      let cy = margins.top;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      doc.text("EVIDÊNCIAS FOTOGRÁFICAS", margins.left, cy);
      cy += 8;

      const photoColW = (pageWidth - margins.left - margins.right - 8) / 2;
      const photoH = photoColW * 0.75;
      let col = 0;

      for (const foto of dados.fotos) {
          if (cy + photoH + 22 > pageHeight - margins.bottom) {
             doc.addPage();
             cy = margins.top + 8;
             col = 0;
          }

          const x = margins.left + col * (photoColW + 8);

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.5);
          doc.rect(x, cy, photoColW, photoH + 18, "F");
          doc.rect(x, cy, photoColW, photoH + 18, "S");

          try {
              doc.addImage(foto.dataUrl, "JPEG", x + 1, cy + 1, photoColW - 2, photoH);
          } catch {
              doc.setFillColor(241, 245, 249);
              doc.rect(x + 1, cy + 1, photoColW - 2, photoH, "F");
              doc.setTextColor(156, 163, 175);
              doc.setFontSize(9);
              doc.text("Erro ao carregar imagem", x + photoColW/2, cy + photoH/2, { align: "center" });
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(15, 23, 42);
          const txtItem = doc.splitTextToSize(`Item: ${foto.perguntaTexto}`, photoColW - 4);
          doc.text(txtItem.slice(0, 2), x + 2, cy + photoH + 6);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(71, 85, 105);
          
          let mt = `${formatarDataHora(foto.capturadaEm)}`;
          if (foto.latitude && foto.longitude) mt += ` | ${formatarCoordenadas(foto)}`;
          if (foto.observacao) mt += `\nObs: ${foto.observacao}`;
          
          const txtMeta = doc.splitTextToSize(mt, photoColW - 4);
          doc.text(txtMeta.slice(0, 3), x + 2, cy + photoH + 11);

          if (col === 1) {
              col = 0;
              cy += photoH + 22;
          } else {
              col = 1;
          }
      }
  }

  // --- HEADER E FOOTER GERAIS ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Top banner estilo marca
    doc.setFillColor(30, 58, 138); // blue-900
    doc.rect(0, 0, pageWidth, 25, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("RELATÓRIO TÉCNICO DE CAMPO", margins.left, 16);

    // Footer padronizado
    doc.setFillColor(248, 250, 252);
    doc.rect(0, pageHeight - 18, pageWidth, 18, "F");
    doc.setDrawColor(226, 232, 240);
    doc.line(0, pageHeight - 18, pageWidth, pageHeight - 18);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Gerado pelo Sistema CIOP em ${formatarDataHora(new Date().toISOString())}`, margins.left, pageHeight - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margins.right, pageHeight - 8, { align: "right" });
  }

  const saida = doc.output("datauristring");
  return saida.slice(saida.indexOf(",") + 1);
}
