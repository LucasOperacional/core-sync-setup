export type FuncaoRoteiro =
  "AUXILIAR DE LIMPEZA" | "PORTEIRO" | "VIGIA" | "AUXILIAR DE LIMPEZA + PORTEIRO";

export type PerguntaRoteiro = {
  id: string;
  texto: string;
  funcao: FuncaoRoteiro;
  bloco: string;
  critica?: boolean;
};

export const FUNCOES_ROTEIRO: FuncaoRoteiro[] = [
  "AUXILIAR DE LIMPEZA",
  "PORTEIRO",
  "VIGIA",
  "AUXILIAR DE LIMPEZA + PORTEIRO",
];

/** Único checklist de supervisão de campo, separado por função e por tópico. */
export const PERGUNTAS: PerguntaRoteiro[] = [
  // ===== AUXILIAR DE LIMPEZA =====
  {
    id: "aux-01",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Efetivo e jornada",
    texto:
      "O colaborador estava no posto no horário da escala e com o ponto (NEXTI) sem pendências?",
    critica: true,
  },
  {
    id: "aux-02",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Uniforme e EPI",
    texto: "Uniforme completo e limpo, crachá visível e EPIs em uso com CA válido?",
    critica: true,
  },
  {
    id: "aux-03",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Rotina de limpeza",
    texto: "O cronograma de limpeza (diária, semanal e mensal) está sendo cumprido?",
    critica: true,
  },
  {
    id: "aux-04",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Rotina de limpeza",
    texto: "Banheiros limpos e abastecidos com papel higiênico, papel toalha e sabonete?",
    critica: true,
  },
  {
    id: "aux-05",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Rotina de limpeza",
    texto: "Pisos, corredores, vidros e mobiliário sem sujidade ou poeira acumulada?",
  },
  {
    id: "aux-06",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Materiais e produtos",
    texto:
      "Materiais e produtos suficientes, rotulados, guardados em local adequado e diluídos conforme o fabricante?",
    critica: true,
  },
  {
    id: "aux-07",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Equipamentos",
    texto: "Carrinho, enceradeira/aspirador e placas de piso molhado disponíveis e em bom estado?",
  },
  {
    id: "aux-08",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Resíduos",
    texto:
      "Coleta e segregação de resíduos conforme o padrão do cliente, com abrigo organizado e sem odor?",
    critica: true,
  },
  {
    id: "aux-09",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Registros",
    texto: "Checklists e planilhas de limpeza preenchidos e assinados no posto?",
  },
  {
    id: "aux-10",
    funcao: "AUXILIAR DE LIMPEZA",
    bloco: "Cliente",
    texto: "Cliente/fiscal do contrato relatou reclamações de limpeza desde a última visita?",
    critica: true,
  },

  // ===== PORTEIRO =====
  {
    id: "por-01",
    funcao: "PORTEIRO",
    bloco: "Efetivo e jornada",
    texto:
      "O colaborador estava no posto no horário da escala e com o ponto (NEXTI) sem pendências?",
    critica: true,
  },
  {
    id: "por-02",
    funcao: "PORTEIRO",
    bloco: "Uniforme e apresentação",
    texto: "Uniforme completo e limpo, crachá visível e apresentação pessoal adequada?",
    critica: true,
  },
  {
    id: "por-03",
    funcao: "PORTEIRO",
    bloco: "Controle de acesso",
    texto: "Visitantes e prestadores identificados e autorizados antes da liberação?",
    critica: true,
  },
  {
    id: "por-04",
    funcao: "PORTEIRO",
    bloco: "Controle de acesso",
    texto:
      "Livro/sistema de entrada e saída de pessoas, veículos e materiais preenchido corretamente?",
    critica: true,
  },
  {
    id: "por-05",
    funcao: "PORTEIRO",
    bloco: "Controle de acesso",
    texto: "Portões, catracas e portas mantidos fechados/travados conforme a norma do cliente?",
    critica: true,
  },
  {
    id: "por-06",
    funcao: "PORTEIRO",
    bloco: "Equipamentos",
    texto: "Interfone, rádio, telefone, câmeras e sistema de acesso funcionando?",
  },
  {
    id: "por-07",
    funcao: "PORTEIRO",
    bloco: "Equipamentos",
    texto: "Chaves controladas em quadro identificado, com registro de retirada e devolução?",
    critica: true,
  },
  {
    id: "por-08",
    funcao: "PORTEIRO",
    bloco: "Organização do posto",
    texto: "Guarita limpa, organizada e sem pessoas estranhas ao serviço?",
  },
  {
    id: "por-09",
    funcao: "PORTEIRO",
    bloco: "Comunicação",
    texto:
      "Livro de ocorrências atualizado, passagem de turno registrada e contatos de emergência conhecidos?",
    critica: true,
  },
  {
    id: "por-10",
    funcao: "PORTEIRO",
    bloco: "Cliente",
    texto: "Cliente relatou falhas de atendimento ou de controle de acesso no período?",
    critica: true,
  },

  // ===== VIGIA =====
  {
    id: "vig-01",
    funcao: "VIGIA",
    bloco: "Efetivo e jornada",
    texto:
      "O colaborador estava no posto no horário da escala e com o ponto (NEXTI) sem pendências?",
    critica: true,
  },
  {
    id: "vig-02",
    funcao: "VIGIA",
    bloco: "Uniforme e apresentação",
    texto: "Uniforme completo e limpo, crachá visível e apresentação pessoal adequada?",
    critica: true,
  },
  {
    id: "vig-03",
    funcao: "VIGIA",
    bloco: "Rondas",
    texto: "Rondas realizadas na frequência e nos pontos previstos na ordem de serviço?",
    critica: true,
  },
  {
    id: "vig-04",
    funcao: "VIGIA",
    bloco: "Rondas",
    texto: "Registro das rondas (livro, planilha ou bastão eletrônico) atualizado no turno?",
    critica: true,
  },
  {
    id: "vig-05",
    funcao: "VIGIA",
    bloco: "Patrimônio",
    texto: "Perímetro, portões, cadeados, janelas e depósitos conferidos e trancados?",
    critica: true,
  },
  {
    id: "vig-06",
    funcao: "VIGIA",
    bloco: "Patrimônio",
    texto: "Nenhum sinal de furto, vandalismo ou avaria não comunicada?",
    critica: true,
  },
  {
    id: "vig-07",
    funcao: "VIGIA",
    bloco: "Equipamentos",
    texto: "Lanterna, rádio/celular corporativo, alarmes e câmeras disponíveis e funcionando?",
  },
  {
    id: "vig-08",
    funcao: "VIGIA",
    bloco: "Vigilância",
    texto: "Colaborador alerta, sem sinais de sono e sem abandono de posto durante o turno?",
    critica: true,
  },
  {
    id: "vig-09",
    funcao: "VIGIA",
    bloco: "Emergência",
    texto:
      "Conhece rotas de fuga, extintores e o acionamento de bombeiros/polícia e da supervisão?",
  },
  {
    id: "vig-10",
    funcao: "VIGIA",
    bloco: "Cliente",
    texto: "Cliente relatou ocorrências de segurança no período desde a última visita?",
    critica: true,
  },

  // ===== AUXILIAR DE LIMPEZA + PORTEIRO (mesclado) =====
  {
    id: "mix-01",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Efetivo e jornada",
    texto:
      "Os colaboradores estavam no posto no horário da escala e com o ponto (NEXTI) sem pendências?",
    critica: true,
  },
  {
    id: "mix-02",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Uniforme e apresentação",
    texto:
      "Uniformes completos e limpos, crachá visível, EPIs em uso (limpeza) e apresentação pessoal adequada?",
    critica: true,
  },
  {
    id: "mix-03",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Controle de acesso",
    texto: "Visitantes e prestadores identificados e autorizados antes da liberação?",
    critica: true,
  },
  {
    id: "mix-04",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Controle de acesso",
    texto:
      "Livro/sistema de entrada e saída de pessoas, veículos e materiais preenchido corretamente?",
    critica: true,
  },
  {
    id: "mix-05",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Rotina de limpeza",
    texto: "O cronograma de limpeza (diária, semanal e mensal) está sendo cumprido?",
    critica: true,
  },
  {
    id: "mix-06",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Rotina de limpeza",
    texto: "Banheiros limpos e abastecidos com papel higiênico, papel toalha e sabonete?",
    critica: true,
  },
  {
    id: "mix-07",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Materiais e produtos",
    texto:
      "Materiais e produtos de limpeza suficientes, rotulados, guardados em local adequado e diluídos conforme o fabricante?",
    critica: true,
  },
  {
    id: "mix-08",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Equipamentos",
    texto:
      "Interfone, rádio, telefone, câmeras, sistema de acesso e equipamentos de limpeza funcionando e em bom estado?",
  },
  {
    id: "mix-09",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Organização do posto",
    texto:
      "Guarita limpa e organizada, coleta e segregação de resíduos conforme o padrão do cliente?",
    critica: true,
  },
  {
    id: "mix-10",
    funcao: "AUXILIAR DE LIMPEZA + PORTEIRO",
    bloco: "Registros e cliente",
    texto:
      "Checklists de limpeza e livro de ocorrências atualizados, e cliente sem reclamações de limpeza ou de controle de acesso no período?",
    critica: true,
  },
];

export const PERGUNTAS_POR_FUNCAO: Record<FuncaoRoteiro, PerguntaRoteiro[]> = {
  "AUXILIAR DE LIMPEZA": PERGUNTAS.filter((p) => p.funcao === "AUXILIAR DE LIMPEZA"),
  PORTEIRO: PERGUNTAS.filter((p) => p.funcao === "PORTEIRO"),
  VIGIA: PERGUNTAS.filter((p) => p.funcao === "VIGIA"),
  "AUXILIAR DE LIMPEZA + PORTEIRO": PERGUNTAS.filter(
    (p) => p.funcao === "AUXILIAR DE LIMPEZA + PORTEIRO",
  ),
};

export type RespostaValor = "conforme" | "nao_conforme" | "na";

export function calcularConformidade(
  perguntas: PerguntaRoteiro[],
  respostas: Record<string, RespostaValor>,
) {
  let conformes = 0;
  let naoConformes = 0;
  let naoAplicaveis = 0;
  let pendentes = 0;
  let criticasAbertas = 0;

  for (const p of perguntas) {
    const r = respostas[p.id];
    if (!r) pendentes += 1;
    else if (r === "conforme") conformes += 1;
    else if (r === "na") naoAplicaveis += 1;
    else {
      naoConformes += 1;
      if (p.critica) criticasAbertas += 1;
    }
  }

  const avaliadas = conformes + naoConformes;
  const percentual = avaliadas > 0 ? Math.round((conformes / avaliadas) * 100) : 0;

  return {
    conformes,
    naoConformes,
    naoAplicaveis,
    pendentes,
    criticasAbertas,
    avaliadas,
    percentual,
  };
}
