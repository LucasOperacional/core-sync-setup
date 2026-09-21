import jsPDF from "jspdf";
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
  const margem = 15;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  const alturaPagina = doc.internal.pageSize.getHeight();
  let y = margem;

  // Cores institucionais
  const COR_TEMA: [number, number, number] = [30, 58, 138]; // blue-900
  const COR_SECUNDARIA: [number, number, number] = [71, 85, 105]; // slate-500
  const COR_FUNDO_CABECALHO: [number, number, number] = [241, 245, 249]; // slate-100
  const COR_TEXTO: [number, number, number] = [15, 23, 42]; // slate-900
  const COR_LINHA: [number, number, number] = [226, 232, 240]; // slate-200

  // Cores de status
  const getCorConformidade = (p: number): [number, number, number] => {
    if (p === 100) return [22, 163, 74]; // green-600
    if (p >= 80) return [234, 179, 8]; // yellow-500
    return [220, 38, 38]; // red-600
  };

  const corStatus = getCorConformidade(dados.resumo.percentual);

  function quebrar(altura: number) {
    if (y + altura > alturaPagina - margem) {
      doc.addPage();
      y = margem;
    }
  }

  function desenharLinha() {
    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.5);
    doc.line(margem, y, margem + largura, y);
    y += 4;
  }

  // --- CABEÇALHO DO DOCUMENTO ---
  doc.setTextColor(...COR_TEMA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("RELATÓRIO DE VISITA TÉCNICA DE CAMPO", margem, y + 5);
  doc.setTextColor(...COR_TEXTO);
  y += 12;

  // Caixa de dados principais
  doc.setFillColor(...COR_FUNDO_CABECALHO);
  doc.roundedRect(margem, y, largura, 52, 2, 2, "F");

  doc.setFontSize(9);
  const infosEsq = [
    ["Posto Avaliado", dados.posto || "—"],
    ["Endereço", dados.endereco || "Não registrado"],
    ["Localização (Lat/Lng)", (dados.latitude && dados.longitude) ? `${dados.latitude.toFixed(6)}, ${dados.longitude.toFixed(6)}` : "Não registrada"],
    ["Função Avaliada", dados.funcao],
    ["Colaborador Avaliado", dados.colaborador || "—"],
  ];
  const infosDir = [
    ["Realizado por (Supervisor)", dados.supervisor || "—"],
    ["Data da Visita", dataBr(dados.dataVisita)],
    ["Início", dados.iniciadoEm ? formatarDataHora(new Date(dados.iniciadoEm).toISOString()) : "—"],
    ["Encerramento", dados.finalizadoEm ? formatarDataHora(new Date(dados.finalizadoEm).toISOString()) : "—"],
    ["Duração", extensoDuracao(dados.duracaoSegundos)],
  ];

  const offsetY = y + 6;
  doc.setFont("helvetica", "bold");
  
  [infosEsq, infosDir].forEach((bloco, cIdx) => {
    let linhaY = offsetY;
    const xBase = cIdx === 0 ? margem + 4 : margem + largura / 2 + 4;
    bloco.forEach(([rotulo, valor]) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR_SECUNDARIA);
      doc.text(rotulo.toUpperCase(), xBase, linhaY);
      linhaY += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COR_TEXTO);
      
      const lines = doc.splitTextToSize(String(valor), (largura / 2) - 8);
      doc.text(lines, xBase, linhaY);
      linhaY += lines.length * 4.5;
    });
  });

  y += 58;

  // --- PAINEL DE CONFORMIDADE ---
  quebrar(18);
  doc.setFillColor(...corStatus);
  doc.setTextColor(255, 255, 255);
  doc.roundedRect(margem, y, largura, 14, 2, 2, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`${dados.resumo.percentual}%`, margem + 5, y + 9);
  
  doc.setFontSize(10);
  doc.text("ÍNDICE DE CONFORMIDADE", margem + 20, y + 9);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const textoMesa = `Conformes: ${dados.resumo.conformes}   |   Não conformes: ${dados.resumo.naoConformes}   |   N/A: ${dados.resumo.naoAplicaveis}   |   Críticos em aberto: ${dados.resumo.criticasAbertas}`;
  doc.text(textoMesa, margem + largura - 5, y + 9, { align: "right" });
  
  doc.setTextColor(...COR_TEXTO);
  y += 22;

  // --- CHECKLIST ---
  let blocoAtual = "";
  dados.perguntas.forEach((pergunta, indice) => {
    if (pergunta.bloco !== blocoAtual) {
      blocoAtual = pergunta.bloco;
      quebrar(15);
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...COR_TEMA);
      doc.text(blocoAtual.toUpperCase(), margem, y);
      doc.setTextColor(...COR_TEXTO);
      y += 3;
      desenharLinha();
      y += 2;
    }
    const resposta = dados.respostas[pergunta.id];
    let iconCor = COR_TEXTO;
    if (resposta === "conforme") iconCor = [22, 163, 74];
    else if (resposta === "nao_conforme") iconCor = [220, 38, 38];
    else if (resposta === "na") iconCor = [156, 163, 175];

    const rotuloFinal = resposta ? ROTULO_RESPOSTA[resposta] : "SEM RESPOSTA";
    
    const textoPergunta = `${indice + 1}. ${pergunta.texto}${pergunta.critica ? " [CRÍTICO]" : ""}`;
    const linhas = doc.splitTextToSize(textoPergunta, largura - 40) as string[];
    
    quebrar(linhas.length * 5 + 6);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(linhas, margem, y + 4);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...iconCor);
    doc.text(rotuloFinal, margem + largura, y + 4, { align: "right" });
    doc.setTextColor(...COR_TEXTO);
    
    y += linhas.length * 5;

    const observacao = dados.observacoes[pergunta.id];
    if (observacao?.trim()) {
      const obs = doc.splitTextToSize(`Observação: ${observacao.trim()}`, largura - 10) as string[];
      quebrar(obs.length * 4.4 + 2);
      
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(1);
      doc.line(margem, y, margem, y + (obs.length * 4.4));
      
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...COR_SECUNDARIA);
      doc.text(obs, margem + 3, y + 3.5);
      doc.setTextColor(...COR_TEXTO);
      y += obs.length * 4.4 + 1;
    }
    
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.5);
    doc.line(margem, y + 3, margem + largura, y + 3);
    y += 5;
  });

  // --- OBSERVAÇÕES GERAIS E PLANO DE AÇÃO ---
  for (const [titulo, texto] of [
    ["OBSERVAÇÕES GERAIS DA VISITA", dados.observacaoGeral],
    ["PLANO DE AÇÃO E PRAZOS", dados.planoAcao],
  ] as const) {
    if (!texto.trim()) continue;
    quebrar(25);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COR_TEMA);
    doc.text(titulo, margem, y);
    doc.setTextColor(...COR_TEXTO);
    y += 3;
    desenharLinha();
    y += 2;

    const linhas = doc.splitTextToSize(texto.trim(), largura) as string[];
    quebrar(linhas.length * 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(linhas, margem, y + 3);
    y += linhas.length * 5 + 3;
  }

  // --- REGISTRO FOTOGRÁFICO ---
  if (dados.fotos.length > 0) {
    doc.addPage();
    y = margem;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COR_TEMA);
    doc.text("EVIDÊNCIAS FOTOGRÁFICAS", margem, y + 5);
    doc.setTextColor(...COR_TEXTO);
    y += 12;
    
    const larguraFoto = (largura - 8) / 2;
    const alturaFoto = larguraFoto * 0.75; // Proporção 4:3
    let coluna = 0;
    
    for (const foto of dados.fotos) {
      if (coluna === 0) quebrar(alturaFoto + 20);
      const x = margem + coluna * (larguraFoto + 8);
      
      doc.setDrawColor(...COR_LINHA);
      doc.setLineWidth(0.5);
      doc.roundedRect(x - 1, y - 1, larguraFoto + 2, alturaFoto + 2, 1, 1, "S");
      
      try {
        doc.addImage(foto.dataUrl, "JPEG", x, y, larguraFoto, alturaFoto);
      } catch {
        doc.setFillColor(...COR_FUNDO_CABECALHO);
        doc.rect(x, y, larguraFoto, alturaFoto, "F");
        doc.text("Falha ao carregar imagem", x + larguraFoto/2, y + alturaFoto/2, { align: "center" });
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...COR_TEXTO);
      
      const legendaTop = doc.splitTextToSize(`Item: ${foto.perguntaTexto}`, larguraFoto);
      doc.text(legendaTop.slice(0, 2), x, y + alturaFoto + 4.5);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...COR_SECUNDARIA);
      
      let infosFoto = `${formatarDataHora(foto.capturadaEm)}`;
      if (foto.latitude && foto.longitude) {
        infosFoto += `\nLocal: ${formatarCoordenadas(foto)}`;
      }
      if (foto.observacao) {
        infosFoto += `\nObs: ${foto.observacao}`;
      }
      
      const detalhes = doc.splitTextToSize(infosFoto, larguraFoto);
      doc.text(detalhes.slice(0, 3), x, y + alturaFoto + 9);
      
      if (coluna === 1) y += alturaFoto + 22;
      coluna = coluna === 0 ? 1 : 0;
    }
  }

  // --- RODAPÉ ---
  const numPaginas = doc.getNumberOfPages();
  const txRodapeCor = [156, 163, 175]; // gray-400
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...txRodapeCor);
    const textoEmissao = `Gerado pelo Sistema Shark Git em ${formatarDataHora(new Date().toISOString())}`;
    doc.text(textoEmissao, margem, alturaPagina - 8);
    doc.text(`Página ${i} de ${numPaginas}`, margem + largura, alturaPagina - 8, { align: "right" });
  }

  const saida = doc.output("datauristring");
  return saida.slice(saida.indexOf(",") + 1);
}
