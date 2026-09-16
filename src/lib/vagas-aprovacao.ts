/** Regras de aprovação automática das vagas abertas. */

export interface VagaAprovavel {
  cargo?: string | null;
  posto?: string | null;
  localidade?: string | null;
  salario?: string | null;
  horario?: string | null;
  dataInicio?: string | null;
  solicitante?: string | null;
  justificativa?: string | null;
  atividade?: string | null;
  perfil?: string | null;
}

export interface AnaliseVaga {
  aprovada: boolean;
  pendencias: string[];
  motivo: string;
}

function vazio(valor?: string | null) {
  return String(valor ?? "").trim().length === 0;
}

function salarioNumero(valor?: string | null): number | null {
  const limpo = String(valor ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Limite acima do qual a vaga precisa de conferência humana. */
export const LIMITE_SALARIO_AUTOMATICO = 8000;

export function analisarVaga(vaga: VagaAprovavel): AnaliseVaga {
  const pendencias: string[] = [];

  const obrigatorios: [keyof VagaAprovavel, string][] = [
    ["cargo", "Cargo não informado"],
    ["posto", "Posto/departamento não informado"],
    ["localidade", "Localidade não informada"],
    ["salario", "Salário não informado"],
    ["horario", "Horário de trabalho não informado"],
    ["dataInicio", "Data de início não informada"],
    ["solicitante", "Solicitante não informado"],
    ["atividade", "Descrição da atividade não informada"],
    ["perfil", "Perfil desejado não informado"],
  ];

  for (const [campo, mensagem] of obrigatorios) {
    if (vazio(vaga[campo])) pendencias.push(mensagem);
  }

  const salario = salarioNumero(vaga.salario);
  if (!vazio(vaga.salario)) {
    if (salario === null || salario <= 0) {
      pendencias.push("Salário em formato inválido");
    } else if (salario > LIMITE_SALARIO_AUTOMATICO) {
      pendencias.push(
        `Salário acima do limite de aprovação automática (R$ ${LIMITE_SALARIO_AUTOMATICO.toLocaleString("pt-BR")})`,
      );
    }
  }

  if (!vazio(vaga.dataInicio)) {
    const data = new Date(`${String(vaga.dataInicio).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(data.getTime())) {
      pendencias.push("Data de início inválida");
    } else {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (data.getTime() < hoje.getTime()) pendencias.push("Data de início já passou");
    }
  }

  if (!vazio(vaga.atividade) && String(vaga.atividade).trim().length < 15) {
    pendencias.push("Descrição da atividade muito curta");
  }

  const aprovada = pendencias.length === 0;
  return {
    aprovada,
    pendencias,
    motivo: aprovada
      ? "Aprovada automaticamente: todos os dados obrigatórios conferidos e dentro das regras."
      : `Enviada para conferência: ${pendencias.length} ponto(s) fora das regras automáticas.`,
  };
}
