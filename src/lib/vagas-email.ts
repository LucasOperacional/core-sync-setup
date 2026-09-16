import type { SolicitacaoVaga } from "@/lib/vagas-template";

const CHAVE_EMAIL = "vagas:email-destino";

export function carregarEmailDestino(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(CHAVE_EMAIL) ?? "";
}

export function salvarEmailDestino(email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_EMAIL, email);
}

export function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function assuntoSolicitacao(dados: SolicitacaoVaga) {
  const partes = [dados.cargo, dados.departamentoPosto, dados.localidade].filter(
    (p) => String(p ?? "").trim().length > 0,
  );
  return `Solicitação de Vaga — ${partes.join(" • ") || "Nova vaga"}`;
}

export function corpoSolicitacao(dados: SolicitacaoVaga, arquivo: string) {
  const linhas = [
    "Olá,",
    "",
    "Segue a Solicitação de Pessoas (RE.DRU.03-SDP-) preenchida:",
    "",
    `Cargo: ${dados.cargo || "—"}`,
    `Tipo: ${dados.tipoSolicitacao === "aumento" ? "Aumento do quadro" : "Reposição de vaga"}`,
    `Depto / Posto: ${dados.departamentoPosto || "—"}`,
    `Localidade: ${dados.localidade || "—"}`,
    `Salário: ${dados.salario || "—"}`,
    `Horário: ${dados.horarioTrabalho || "—"}`,
    `Data de início: ${dados.dataInicio || "—"}`,
    `Solicitante: ${dados.solicitante || "—"}`,
    `Data da solicitação: ${dados.dataSolicitacao || "—"}`,
    "",
    "Justificativa:",
    dados.justificativa || "—",
    "",
    "Descrição da atividade:",
    dados.descricaoAtividade || "—",
    "",
    "Perfil desejado:",
    dados.perfilDesejado || "—",
    "",
    `O PDF "${arquivo}" foi gerado e baixado automaticamente — anexe-o a este e-mail antes de enviar.`,
  ];
  return linhas.join("\n");
}

/** Abre o cliente de e-mail com assunto e corpo já preenchidos (usado como alternativa). */
export function abrirEmailSolicitacao(dados: SolicitacaoVaga, destino: string, arquivo: string) {
  const url = `mailto:${encodeURIComponent(destino)}?subject=${encodeURIComponent(
    assuntoSolicitacao(dados),
  )}&body=${encodeURIComponent(corpoSolicitacao(dados, arquivo))}`;
  if (typeof window !== "undefined") window.location.href = url;
}

export function tipoSolicitacaoLabel(dados: SolicitacaoVaga) {
  return dados.tipoSolicitacao === "aumento" ? "Aumento do quadro" : "Reposição de vaga";
}
