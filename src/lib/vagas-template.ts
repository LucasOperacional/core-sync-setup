/**
 * Template de Solicitação de Pessoas (RE.DRU.03-SDP-)
 * Modelos de preenchimento automático por cargo.
 */

export interface SolicitacaoVaga {
  cargo: string;
  nomeCandidato: string;
  tipoSolicitacao: "reposicao" | "aumento";
  colaboradorSubstituido: string;
  justificativa: string;
  departamentoPosto: string;
  sexo: "" | "fem" | "masc" | "indiferente";
  localidade: string;
  salario: string;
  valeAlimentacao: boolean;
  valeTransporte: string;
  planoSaude: boolean;
  planoOdontologico: boolean;
  gratificacao: string;
  outrosBeneficios: string;
  horarioTrabalho: string;
  dataInicio: string;
  descricaoAtividade: string;
  perfilDesejado: string;
  fiscalResponsavel: string;
  solicitante: string;
  dataSolicitacao: string;
  coordenadorOperacional: string;
}

export const SOLICITACAO_VAZIA: SolicitacaoVaga = {
  cargo: "",
  nomeCandidato: "",
  tipoSolicitacao: "reposicao",
  colaboradorSubstituido: "",
  justificativa: "",
  departamentoPosto: "",
  sexo: "",
  localidade: "",
  salario: "",
  valeAlimentacao: true,
  valeTransporte: "",
  planoSaude: false,
  planoOdontologico: false,
  gratificacao: "",
  outrosBeneficios: "",
  horarioTrabalho: "",
  dataInicio: "",
  descricaoAtividade: "",
  perfilDesejado: "",
  fiscalResponsavel: "",
  solicitante: "",
  dataSolicitacao: "",
  coordenadorOperacional: "",
};

export interface ModeloVaga {
  id: string;
  nome: string;
  dados: Partial<SolicitacaoVaga>;
}

/** Modelos que preenchem automaticamente os campos do template. */
export const MODELOS_VAGA: ModeloVaga[] = [
  {
    id: "asg",
    nome: "ASG / Serviços Gerais",
    dados: {
      cargo: "AUXILIAR DE SERVIÇOS GERAIS (ASG)",
      departamentoPosto: "LIMPEZA",
      salario: "Piso da categoria (Convenção Coletiva)",
      valeAlimentacao: true,
      valeTransporte: "Conforme trajeto residência x posto",
      planoSaude: true,
      planoOdontologico: true,
      horarioTrabalho: "07h00 às 17h00 - Segunda a sexta (1h de intervalo)",
      descricaoAtividade:
        "Executar a limpeza e conservação de áreas internas e externas, higienização de sanitários, recolhimento de resíduos, reposição de materiais e apoio às demandas do posto.",
      perfilDesejado:
        "Ensino fundamental completo; experiência mínima de 6 meses em limpeza predial; disponibilidade de horário; boa apresentação pessoal; comprometimento e assiduidade.",
    },
  },
  {
    id: "jatista",
    nome: "Jatista",
    dados: {
      cargo: "JATISTA",
      departamentoPosto: "JATISTA",
      salario: "Piso da categoria + adicional de insalubridade",
      valeAlimentacao: true,
      planoSaude: true,
      horarioTrabalho: "07h00 às 17h00 - Segunda a sexta",
      descricaoAtividade:
        "Operar equipamento de jateamento/hidrojateamento na limpeza pesada de fachadas, pisos e áreas industriais, seguindo os procedimentos de segurança e uso obrigatório de EPI.",
      perfilDesejado:
        "Experiência comprovada com hidrojateamento; treinamentos de segurança (NR-06, NR-35 desejável); atenção a procedimentos e uso de EPI.",
    },
  },
  {
    id: "portaria",
    nome: "Porteiro / Reserva Portaria",
    dados: {
      cargo: "PORTEIRO",
      departamentoPosto: "PORTARIA",
      salario: "Piso da categoria (Convenção Coletiva)",
      valeAlimentacao: true,
      valeTransporte: "Conforme trajeto residência x posto",
      planoSaude: true,
      horarioTrabalho: "Escala 12x36 - 07h00 às 19h00",
      descricaoAtividade:
        "Controlar o acesso de pessoas e veículos, realizar registro de entrada e saída, atender ao público, operar sistemas de monitoramento e reportar ocorrências ao fiscal responsável.",
      perfilDesejado:
        "Ensino médio completo; experiência em portaria/controle de acesso; boa comunicação; disponibilidade para escala 12x36.",
    },
  },
  {
    id: "noturna",
    nome: "Reserva Noturna",
    dados: {
      cargo: "AGENTE DE PORTARIA - NOTURNO",
      departamentoPosto: "RESERVA NOTURNA",
      salario: "Piso da categoria + adicional noturno",
      valeAlimentacao: true,
      planoSaude: true,
      horarioTrabalho: "Escala 12x36 - 19h00 às 07h00",
      descricaoAtividade:
        "Cobertura noturna do posto: controle de acesso, rondas periódicas, registro de ocorrências em livro/aplicativo e comunicação imediata de anormalidades.",
      perfilDesejado:
        "Experiência em turno noturno; disponibilidade para escala 12x36; postura vigilante e responsável.",
    },
  },
  {
    id: "encarregado",
    nome: "Encarregado Operacional",
    dados: {
      cargo: "ENCARREGADO OPERACIONAL",
      departamentoPosto: "ENCARREGADO",
      salario: "A combinar conforme tabela interna",
      valeAlimentacao: true,
      planoSaude: true,
      planoOdontologico: true,
      gratificacao: "Gratificação de função",
      horarioTrabalho: "08h00 às 18h00 - Segunda a sexta",
      descricaoAtividade:
        "Liderar a equipe do posto, distribuir tarefas, controlar frequência e escalas, conferir materiais e EPIs, acompanhar indicadores e ser o ponto de contato com o cliente.",
      perfilDesejado:
        "Ensino médio completo; experiência em liderança de equipes de limpeza/portaria; domínio básico de informática; perfil organizado e comunicativo.",
    },
  },
  {
    id: "administrativo",
    nome: "Auxiliar Administrativo",
    dados: {
      cargo: "AUXILIAR ADMINISTRATIVO",
      departamentoPosto: "ADMINISTRATIVO",
      salario: "A combinar",
      valeAlimentacao: true,
      valeTransporte: "Conforme trajeto residência x escritório",
      planoSaude: true,
      planoOdontologico: true,
      horarioTrabalho: "08h00 às 18h00 - Segunda a sexta (1h de intervalo)",
      descricaoAtividade:
        "Apoio administrativo: conferência de documentos, lançamentos em sistema, atendimento telefônico, organização de arquivos e suporte às rotinas do departamento.",
      perfilDesejado:
        "Ensino médio completo; pacote Office intermediário; organização, boa redação e atenção a prazos.",
    },
  },
];

export const SUGESTOES_JUSTIFICATIVA = [
  "Substituição por pedido de demissão do colaborador.",
  "Substituição por desligamento (dispensa sem justa causa).",
  "Cobertura de afastamento (INSS / atestado prolongado).",
  "Cobertura de férias programadas.",
  "Aumento de escopo solicitado pelo cliente no contrato.",
  "Abertura de novo posto de trabalho.",
];

export const SUGESTOES_HORARIO = [
  "07h00 às 17h00 - Segunda a sexta (1h de intervalo)",
  "08h00 às 18h00 - Segunda a sexta (1h de intervalo)",
  "Escala 12x36 - 07h00 às 19h00",
  "Escala 12x36 - 19h00 às 07h00",
  "06h00 às 14h20 - Segunda a sábado",
  "14h00 às 22h00 - Segunda a sábado",
];

const RASCUNHO_KEY = "vagas-solicitacao-rascunho-v1";

export function salvarRascunho(dados: SolicitacaoVaga): void {
  try {
    localStorage.setItem(RASCUNHO_KEY, JSON.stringify(dados));
  } catch {
    /* storage indisponível */
  }
}

export function carregarRascunho(): SolicitacaoVaga | null {
  try {
    const raw = localStorage.getItem(RASCUNHO_KEY);
    if (!raw) return null;
    return { ...SOLICITACAO_VAZIA, ...(JSON.parse(raw) as Partial<SolicitacaoVaga>) };
  } catch {
    return null;
  }
}

export function limparRascunho(): void {
  try {
    localStorage.removeItem(RASCUNHO_KEY);
  } catch {
    /* ignore */
  }
}
