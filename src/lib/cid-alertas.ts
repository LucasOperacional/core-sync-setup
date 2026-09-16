/**
 * Catálogo de alertas por CID para consulta antes da análise de um atestado.
 * Traz sintomas típicos, tratamento/conduta usual, tempo de afastamento
 * esperado, pontos de atenção e links oficiais.
 */

export type CidRisco = "baixo" | "medio" | "alto";

export interface CidAlerta {
  codigo: string;
  titulo: string;
  grupo: string;
  risco: CidRisco;
  sintomas: string[];
  tratamentos: string[];
  afastamentoTipico: string;
  atencao: string;
  links: Array<{ rotulo: string; url: string }>;
}

const LINK_DATASUS = (codigo: string) => ({
  rotulo: "CID-10 (DATASUS)",
  url: `http://www2.datasus.gov.br/cid10/V2008/WebHelp/${codigo.replace(".", "").toLowerCase()}.htm`,
});
const LINK_OMS = (codigo: string) => ({
  rotulo: "OMS / ICD Browser",
  url: `https://icd.who.int/browse10/2019/en#/${codigo}`,
});
const LINK_MS = {
  rotulo: "Ministério da Saúde",
  url: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z",
};
const LINK_INSS = {
  rotulo: "Regras de afastamento (INSS)",
  url: "https://www.gov.br/inss/pt-br/saiba-mais/auxilio-por-incapacidade-temporaria",
};

export const CID_ALERTAS: CidAlerta[] = [
  {
    codigo: "J00",
    titulo: "Nasofaringite aguda (resfriado comum)",
    grupo: "Respiratório",
    risco: "baixo",
    sintomas: [
      "Coriza e obstrução nasal",
      "Dor de garganta leve",
      "Tosse seca",
      "Febre baixa ou ausente",
    ],
    tratamentos: [
      "Sintomáticos (analgésico/antitérmico)",
      "Hidratação e repouso",
      "Lavagem nasal com soro",
    ],
    afastamentoTipico: "1 a 3 dias",
    atencao:
      "Atestados repetidos com este CID e afastamentos longos (acima de 3 dias) merecem conferência.",
    links: [LINK_DATASUS("J00"), LINK_OMS("J00"), LINK_MS],
  },
  {
    codigo: "J02.9",
    titulo: "Faringite aguda não especificada",
    grupo: "Respiratório",
    risco: "baixo",
    sintomas: ["Dor de garganta", "Odinofagia", "Febre", "Gânglios cervicais dolorosos"],
    tratamentos: [
      "Analgésicos e anti-inflamatórios",
      "Antibiótico apenas em suspeita bacteriana",
      "Hidratação",
    ],
    afastamentoTipico: "1 a 3 dias",
    atencao: "Quadro autolimitado; afastamento acima de 5 dias é incomum.",
    links: [LINK_DATASUS("J02.9"), LINK_OMS("J02.9")],
  },
  {
    codigo: "J06.9",
    titulo: "Infecção aguda das vias aéreas superiores",
    grupo: "Respiratório",
    risco: "baixo",
    sintomas: ["Coriza", "Tosse", "Dor de garganta", "Mal-estar geral"],
    tratamentos: ["Sintomáticos", "Repouso relativo", "Retorno se piora ou febre persistente"],
    afastamentoTipico: "1 a 3 dias",
    atencao: "CID genérico e o mais usado em atestados curtos — confira data, CRM e carimbo.",
    links: [LINK_DATASUS("J06.9"), LINK_OMS("J06.9")],
  },
  {
    codigo: "J11",
    titulo: "Influenza (gripe) por vírus não identificado",
    grupo: "Respiratório",
    risco: "medio",
    sintomas: ["Febre alta de início súbito", "Mialgia e cefaleia", "Tosse", "Prostração"],
    tratamentos: [
      "Antivirais em grupos de risco",
      "Sintomáticos e hidratação",
      "Isolamento respiratório",
    ],
    afastamentoTipico: "3 a 5 dias",
    atencao: "Verificar orientação de isolamento e vacinação anual do colaborador.",
    links: [LINK_DATASUS("J11"), LINK_OMS("J11"), LINK_MS],
  },
  {
    codigo: "A09",
    titulo: "Diarreia e gastroenterite de origem infecciosa presumível",
    grupo: "Gastrointestinal",
    risco: "medio",
    sintomas: ["Diarreia", "Náusea e vômitos", "Cólicas abdominais", "Febre baixa"],
    tratamentos: [
      "Reidratação oral",
      "Dieta leve",
      "Antiemético/antiespasmódico conforme prescrição",
    ],
    afastamentoTipico: "1 a 3 dias",
    atencao: "Em manipuladores de alimentos há regra de afastamento até cessarem os sintomas.",
    links: [LINK_DATASUS("A09"), LINK_OMS("A09")],
  },
  {
    codigo: "K29.7",
    titulo: "Gastrite não especificada",
    grupo: "Gastrointestinal",
    risco: "baixo",
    sintomas: ["Dor epigástrica", "Queimação", "Empachamento", "Náusea"],
    tratamentos: ["Inibidor de bomba de prótons", "Ajuste alimentar", "Investigação de H. pylori"],
    afastamentoTipico: "1 a 2 dias",
    atencao: "Afastamentos longos exigem laudo complementar (endoscopia/relatório).",
    links: [LINK_DATASUS("K29.7"), LINK_OMS("K29.7")],
  },
  {
    codigo: "M54.5",
    titulo: "Dor lombar baixa (lumbago)",
    grupo: "Osteomuscular",
    risco: "medio",
    sintomas: ["Dor lombar", "Limitação de movimento", "Contratura muscular", "Dor à palpação"],
    tratamentos: [
      "Analgésico e anti-inflamatório",
      "Fisioterapia",
      "Retorno gradual às atividades",
    ],
    afastamentoTipico: "2 a 7 dias",
    atencao: "CID frequente em nexo ocupacional — avaliar CAT e ergonomia do posto.",
    links: [LINK_DATASUS("M54.5"), LINK_OMS("M54.5"), LINK_INSS],
  },
  {
    codigo: "M75.1",
    titulo: "Síndrome do manguito rotador",
    grupo: "Osteomuscular",
    risco: "alto",
    sintomas: ["Dor no ombro", "Limitação para elevar o braço", "Dor noturna", "Perda de força"],
    tratamentos: [
      "Fisioterapia",
      "Anti-inflamatórios",
      "Infiltração ou cirurgia em casos refratários",
    ],
    afastamentoTipico: "15 a 90 dias",
    atencao:
      "Forte suspeita de doença ocupacional (LER/DORT): abrir CAT e encaminhar ao INSS acima de 15 dias.",
    links: [LINK_DATASUS("M75.1"), LINK_OMS("M75.1"), LINK_INSS],
  },
  {
    codigo: "M65.9",
    titulo: "Tenossinovite não especificada",
    grupo: "Osteomuscular",
    risco: "alto",
    sintomas: ["Dor em tendão", "Edema local", "Crepitação", "Piora com movimento repetitivo"],
    tratamentos: ["Imobilização relativa", "Fisioterapia", "Anti-inflamatórios"],
    afastamentoTipico: "7 a 30 dias",
    atencao: "Relacionada a esforço repetitivo — verificar nexo ocupacional e histórico do posto.",
    links: [LINK_DATASUS("M65.9"), LINK_OMS("M65.9"), LINK_INSS],
  },
  {
    codigo: "F32",
    titulo: "Episódio depressivo",
    grupo: "Saúde mental",
    risco: "alto",
    sintomas: [
      "Humor deprimido",
      "Perda de interesse",
      "Insônia ou hipersonia",
      "Fadiga e alteração de apetite",
    ],
    tratamentos: ["Psicoterapia", "Antidepressivos", "Acompanhamento psiquiátrico regular"],
    afastamentoTipico: "15 a 90 dias",
    atencao:
      "Dado sensível: sigilo obrigatório. Acima de 15 dias, encaminhar ao INSS e acionar a medicina do trabalho.",
    links: [LINK_DATASUS("F32"), LINK_OMS("F32"), LINK_INSS],
  },
  {
    codigo: "F41.1",
    titulo: "Ansiedade generalizada",
    grupo: "Saúde mental",
    risco: "alto",
    sintomas: ["Preocupação excessiva", "Tensão muscular", "Insônia", "Taquicardia e sudorese"],
    tratamentos: ["Psicoterapia (TCC)", "Ansiolíticos/antidepressivos", "Higiene do sono"],
    afastamentoTipico: "3 a 30 dias",
    atencao:
      "Sigilo do diagnóstico; avaliar fatores organizacionais e programa de apoio ao colaborador.",
    links: [LINK_DATASUS("F41.1"), LINK_OMS("F41.1")],
  },
  {
    codigo: "F43.0",
    titulo: "Reação aguda ao estresse",
    grupo: "Saúde mental",
    risco: "medio",
    sintomas: ["Confusão e desorientação inicial", "Ansiedade intensa", "Insônia", "Isolamento"],
    tratamentos: [
      "Suporte psicológico",
      "Medicação sintomática breve",
      "Reavaliação em poucos dias",
    ],
    afastamentoTipico: "1 a 7 dias",
    atencao: "Se ligado a evento no trabalho (assalto, acidente), avaliar CAT.",
    links: [LINK_DATASUS("F43.0"), LINK_OMS("F43.0")],
  },
  {
    codigo: "G43",
    titulo: "Migrânea (enxaqueca)",
    grupo: "Neurológico",
    risco: "baixo",
    sintomas: ["Cefaleia pulsátil unilateral", "Náusea", "Fotofobia e fonofobia", "Aura visual"],
    tratamentos: [
      "Triptanos e analgésicos",
      "Profilaxia em crises frequentes",
      "Controle de gatilhos",
    ],
    afastamentoTipico: "1 a 2 dias",
    atencao:
      "Crises muito frequentes com atestados repetidos indicam necessidade de avaliação ocupacional.",
    links: [LINK_DATASUS("G43"), LINK_OMS("G43")],
  },
  {
    codigo: "H10",
    titulo: "Conjuntivite",
    grupo: "Oftalmológico",
    risco: "medio",
    sintomas: [
      "Hiperemia conjuntival",
      "Secreção",
      "Lacrimejamento",
      "Sensação de areia nos olhos",
    ],
    tratamentos: [
      "Higiene ocular e compressas",
      "Colírio conforme causa",
      "Afastamento por contágio",
    ],
    afastamentoTipico: "3 a 7 dias",
    atencao:
      "Altamente contagiosa: afastamento tem finalidade coletiva, confira o período indicado.",
    links: [LINK_DATASUS("H10"), LINK_OMS("H10")],
  },
  {
    codigo: "N39.0",
    titulo: "Infecção do trato urinário",
    grupo: "Geniturinário",
    risco: "baixo",
    sintomas: [
      "Disúria",
      "Aumento da frequência urinária",
      "Dor suprapúbica",
      "Febre em casos altos",
    ],
    tratamentos: ["Antibioticoterapia", "Hidratação", "Analgésico urinário"],
    afastamentoTipico: "1 a 3 dias",
    atencao: "Pielonefrite (febre alta e dor lombar) justifica afastamento maior com relatório.",
    links: [LINK_DATASUS("N39.0"), LINK_OMS("N39.0")],
  },
  {
    codigo: "O26.8",
    titulo: "Outras afecções ligadas à gravidez",
    grupo: "Gestação",
    risco: "medio",
    sintomas: ["Náuseas e vômitos", "Dor pélvica", "Cansaço", "Alterações pressóricas"],
    tratamentos: [
      "Pré-natal regular",
      "Repouso conforme indicação",
      "Medicação segura na gestação",
    ],
    afastamentoTipico: "Variável (conforme pré-natal)",
    atencao:
      "Gestante tem estabilidade e regras específicas — nunca exigir detalhamento do diagnóstico.",
    links: [LINK_DATASUS("O26.8"), LINK_OMS("O26.8")],
  },
  {
    codigo: "S93.4",
    titulo: "Entorse e distensão do tornozelo",
    grupo: "Traumatológico",
    risco: "medio",
    sintomas: ["Dor e edema no tornozelo", "Equimose", "Dificuldade para apoiar o pé"],
    tratamentos: ["Gelo, compressão e elevação", "Imobilização", "Fisioterapia"],
    afastamentoTipico: "3 a 21 dias",
    atencao: "Se ocorreu no trabalho ou no trajeto, é acidente de trabalho: emitir CAT.",
    links: [LINK_DATASUS("S93.4"), LINK_OMS("S93.4"), LINK_INSS],
  },
  {
    codigo: "T00.8",
    titulo: "Traumatismos superficiais de outras regiões do corpo",
    grupo: "Traumatológico",
    risco: "medio",
    sintomas: ["Escoriações", "Contusões", "Dor localizada", "Edema"],
    tratamentos: ["Limpeza e curativo", "Analgesia", "Reavaliação se piora"],
    afastamentoTipico: "1 a 5 dias",
    atencao: "Traumas múltiplos exigem descrição do mecanismo; se ligado ao trabalho, abrir CAT.",
    links: [LINK_DATASUS("T00.8"), LINK_OMS("T00.8")],
  },
  {
    codigo: "Z76.3",
    titulo: "Pessoa em boa saúde acompanhando pessoa doente",
    grupo: "Acompanhamento",
    risco: "baixo",
    sintomas: ["Sem sintomas do próprio colaborador"],
    tratamentos: ["Não se aplica — atestado de acompanhante"],
    afastamentoTipico: "1 dia (horas)",
    atencao: "Abono depende de norma interna/CCT e de comprovação do vínculo com o paciente.",
    links: [LINK_DATASUS("Z76.3"), LINK_OMS("Z76.3")],
  },
  {
    codigo: "Z00.0",
    titulo: "Exame médico geral",
    grupo: "Acompanhamento",
    risco: "baixo",
    sintomas: ["Consulta de rotina, sem doença"],
    tratamentos: ["Não se aplica"],
    afastamentoTipico: "Horas do dia da consulta",
    atencao: "Não justifica afastamento de dias inteiros; confira o horário declarado.",
    links: [LINK_DATASUS("Z00.0"), LINK_OMS("Z00.0")],
  },
];

export function buscarCidAlertas(termo: string): CidAlerta[] {
  const t = termo.trim().toLowerCase();
  if (!t) return CID_ALERTAS;
  return CID_ALERTAS.filter((c) =>
    [c.codigo, c.titulo, c.grupo, c.atencao, ...c.sintomas, ...c.tratamentos]
      .join(" ")
      .toLowerCase()
      .includes(t),
  );
}

/** Encontra o alerta correspondente a um CID lido pela IA (ex.: "T00.8" ou "F32.1"). */
export function alertaParaCid(cid: string): CidAlerta | undefined {
  const limpo = cid.replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  if (!limpo) return undefined;
  return (
    CID_ALERTAS.find((c) => c.codigo.toUpperCase() === limpo) ??
    CID_ALERTAS.find((c) => limpo.startsWith(c.codigo.toUpperCase())) ??
    CID_ALERTAS.find((c) => c.codigo.toUpperCase().startsWith(limpo.slice(0, 3)))
  );
}
