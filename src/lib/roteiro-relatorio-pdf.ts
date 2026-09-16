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

/** Monta o relatório em PDF da visita de campo e devolve o conteúdo em base64. */
export function gerarRelatorioRoteiroPdf(dados: DadosRelatorioRoteiro): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 14;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  const alturaPagina = doc.internal.pageSize.getHeight();
  let y = margem;

  function quebrar(altura: number) {
    if (y + altura > alturaPagina - margem) {
      doc.addPage();
      y = margem;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("RELATÓRIO DE VISITA TÉCNICA DE CAMPO", margem, y + 4);
  y += 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const cabecalho: [string, string][] = [
    ["Realizado por", dados.supervisor || "—"],
    ["Data da visita", dataBr(dados.dataVisita)],
    ["Função avaliada", dados.funcao],
    ["Posto", dados.posto || "—"],
    ["Emitido em", formatarDataHora(new Date().toISOString())],
  ];
  for (const [rotulo, valor] of cabecalho) {
    quebrar(6);
    doc.setFont("helvetica", "bold");
    doc.text(`${rotulo}:`, margem, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(valor), margem + 45, y);
    y += 5.5;
  }

  y += 3;
  quebrar(14);
  doc.setFillColor(240, 240, 240);
  doc.rect(margem, y - 4, largura, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.text(
    `Conformidade: ${dados.resumo.percentual}%   |   Conformes: ${dados.resumo.conformes}   |   Não conformes: ${dados.resumo.naoConformes}   |   N/A: ${dados.resumo.naoAplicaveis}   |   Críticos abertos: ${dados.resumo.criticasAbertas}`,
    margem + 2,
    y + 2.5,
  );
  y += 14;

  let blocoAtual = "";
  dados.perguntas.forEach((pergunta, indice) => {
    if (pergunta.bloco !== blocoAtual) {
      blocoAtual = pergunta.bloco;
      quebrar(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(blocoAtual.toUpperCase(), margem, y);
      y += 6;
    }
    const resposta = dados.respostas[pergunta.id];
    const linhas = doc.splitTextToSize(
      `${indice + 1}. ${pergunta.texto}${pergunta.critica ? " (item crítico)" : ""}`,
      largura - 40,
    ) as string[];
    quebrar(linhas.length * 4.6 + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(linhas, margem, y);
    doc.setFont("helvetica", "bold");
    doc.text(resposta ? ROTULO_RESPOSTA[resposta] : "SEM RESPOSTA", margem + largura, y, {
      align: "right",
    });
    y += linhas.length * 4.6 + 1.5;

    const observacao = dados.observacoes[pergunta.id];
    if (observacao?.trim()) {
      const obs = doc.splitTextToSize(`Observação: ${observacao.trim()}`, largura - 6) as string[];
      quebrar(obs.length * 4.4 + 2);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text(obs, margem + 4, y);
      y += obs.length * 4.4 + 1;
    }
    y += 2;
  });

  for (const [titulo, texto] of [
    ["OBSERVAÇÕES GERAIS DA VISITA", dados.observacaoGeral],
    ["PLANO DE AÇÃO / PRAZOS", dados.planoAcao],
  ] as const) {
    if (!texto.trim()) continue;
    quebrar(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(titulo, margem, y);
    y += 5.5;
    const linhas = doc.splitTextToSize(texto.trim(), largura) as string[];
    quebrar(linhas.length * 4.6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(linhas, margem, y);
    y += linhas.length * 4.6 + 4;
  }

  if (dados.fotos.length > 0) {
    doc.addPage();
    y = margem;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("REGISTRO FOTOGRÁFICO", margem, y);
    y += 7;
    const larguraFoto = (largura - 6) / 2;
    const alturaFoto = larguraFoto * 0.72;
    let coluna = 0;
    for (const foto of dados.fotos) {
      if (coluna === 0) quebrar(alturaFoto + 16);
      const x = margem + coluna * (larguraFoto + 6);
      try {
        doc.addImage(foto.dataUrl, "JPEG", x, y, larguraFoto, alturaFoto);
      } catch {
        doc.rect(x, y, larguraFoto, alturaFoto);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const legenda = doc.splitTextToSize(
        `${foto.perguntaTexto}\n${formatarDataHora(foto.capturadaEm)} · ${formatarCoordenadas(foto)}${
          foto.observacao ? ` · ${foto.observacao}` : ""
        }`,
        larguraFoto,
      ) as string[];
      doc.text(legenda.slice(0, 4), x, y + alturaFoto + 3.5);
      if (coluna === 1) y += alturaFoto + 18;
      coluna = coluna === 0 ? 1 : 0;
    }
  }

  const saida = doc.output("datauristring");
  return saida.slice(saida.indexOf(",") + 1);
}
