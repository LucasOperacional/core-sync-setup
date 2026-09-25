import type { ItemCategoria } from "@/components/CategoriaCards";

export interface CategoriaMenu {
  /** Chave da permissão de categoria ("categoria-comercial", etc.). */
  chave: string;
  titulo: string;
  descricao: string;
  itens: ItemCategoria[];
}

/**
 * Cards exibidos na página de cada categoria do menu lateral.
 * A página vive em /categoria/$cat.
 */
export const CATEGORIAS_MENU: Record<string, CategoriaMenu> = {
  comercial: {
    chave: "categoria-comercial",
    titulo: "Comercial",
    descricao: "Clientes, oportunidades, propostas e fechamentos do departamento comercial.",
    itens: [
      { to: "/comercial-clientes", label: "Clientes", descricao: "Base de clientes do departamento.", icon: "users" },
      { to: "/comercial-funil", label: "Funil", descricao: "Oportunidades por etapa da negociação.", icon: "target" },
      { to: "/comercial-propostas", label: "Propostas", descricao: "Propostas com custo, margem e PDF.", icon: "file" },
      { to: "/comercial-agenda", label: "Agenda", descricao: "Compromissos e reuniões comerciais.", icon: "calendar" },
      { to: "/comercial-contratos", label: "Contratos", descricao: "Contratos fechados e vigentes.", icon: "briefcase" },
      { to: "/comercial-relatorios", label: "Relatórios", descricao: "Desempenho comercial em PDF e Excel.", icon: "chart" },
      { to: "/prospeccao-maps", label: "Prospecção Google Maps", descricao: "Encontre empresas e contatos pelo mapa.", icon: "pin", livre: true },
    ],
  },
  "departamento-pessoal": {
    chave: "categoria-departamento-pessoal",
    titulo: "Departamento pessoal",
    descricao: "Ponto eletrônico, espelhos, escalas e fechamento do período.",
    itens: [
      { to: "/ponto", label: "Registro de ponto", descricao: "Marcações de entrada, intervalo e saída.", icon: "clock" },
      { to: "/ponto-espelho", label: "Meu espelho", descricao: "Seu espelho de ponto do mês em PDF.", icon: "file" },
      { to: "/ponto-ajustes", label: "Solicitar ajuste", descricao: "Peça correções de marcações.", icon: "pencil" },
      { to: "/ponto-painel", label: "Painel do ponto", descricao: "Presença por empresa, posto e funcionário.", icon: "chart" },
      { to: "/ponto-aprovacoes", label: "Aprovações", descricao: "Pedidos de correção para decidir.", icon: "check" },
      { to: "/ponto-funcionarios", label: "Funcionários", descricao: "Cadastro e vínculo com usuários.", icon: "users" },
      { to: "/ponto-empresas", label: "Empresas e postos", descricao: "Lotação e estrutura da empresa.", icon: "building" },
      { to: "/ponto-escalas", label: "Escalas", descricao: "Jornadas previstas por funcionário.", icon: "calendar" },
      { to: "/ponto-banco-horas", label: "Banco de horas", descricao: "Saldos e compensações.", icon: "alarm" },
      { to: "/ponto-faltas", label: "Faltas", descricao: "Ausências registradas no ponto.", icon: "calendar" },
      { to: "/ponto-fechamento", label: "Fechamento", descricao: "Fechamento mensal do período.", icon: "briefcase" },
      { to: "/ponto-relatorios", label: "Relatórios do ponto", descricao: "Exportações em PDF, Excel e CSV.", icon: "chart" },
      { to: "/ponto-configuracoes", label: "Configurações", descricao: "Regras do controle de ponto.", icon: "settings" },
      { to: "/ponto-auditoria", label: "Auditoria", descricao: "Histórico de acessos e alterações.", icon: "shield" },
    ],
  },
  financeiro: {
    chave: "categoria-financeiro",
    titulo: "Financeiro",
    descricao: "Rotinas financeiras da empresa.",
    itens: [],
  },
  operacional: {
    chave: "categoria-operacional",
    titulo: "Operacional",
    descricao: "Supervisão, postos, mesas e indicadores da operação.",
    itens: [
      { to: "/control", label: "Control", descricao: "Dashboard de supervisão dos postos.", icon: "chart" },
      { to: "/faltas", label: "Faltas", descricao: "Acompanhamento de faltas da equipe.", icon: "calendar" },
      { to: "/atestados", label: "Atestados", descricao: "Gestão e conferência de atestados.", icon: "clipboard" },
      { to: "/protocolo-folhas-ponto", label: "Folhas", descricao: "Protocolo de entrega de folhas de ponto.", icon: "signature" },
      { to: "/chat-interno", label: "Chat interno", descricao: "Converse com a equipe em tempo real.", icon: "users" },
      { to: "/admin", label: "Administração", descricao: "Importações, usuários e configurações.", icon: "shield" },
      { to: "/ia-operacional", label: "IA operacional", descricao: "Monitoramento inteligente de falhas.", icon: "zap" },
      { to: "/coordenacao", label: "Coordenação", descricao: "Vagas e movimentações em andamento.", icon: "briefcase" },
      { to: "/supervisor", label: "Supervisão", descricao: "Relatórios de visita e rotas de campo.", icon: "pin" },
      { to: "/gps", label: "GPS", descricao: "Rastreamento em tempo real.", icon: "pin" },
      { to: "/areas", label: "Áreas", descricao: "Áreas operacionais por gerente.", icon: "grid" },
      { to: "/mesa-operacional", label: "Mesa operacional", descricao: "Check-in diário dos postos de serviço.", icon: "clipboard" },
      { to: "/postos", label: "Postos", descricao: "Postos de serviço e vagas disponíveis.", icon: "building" },
      { to: "/indicadores", label: "Indicadores", descricao: "Tempo de execução dos relatórios de campo.", icon: "gauge" },
    ],
  },
  "recursos-humanos": {
    chave: "categoria-recursos-humanos",
    titulo: "Recursos humanos",
    descricao: "Central de RH e vagas aprovadas.",
    itens: [
      { to: "/rh", label: "Recursos humanos", descricao: "Central de recursos humanos.", icon: "building" },
      { to: "/vagas-aprovadas", label: "Vagas aprovadas", descricao: "Vagas aprovadas para abertura.", icon: "chart" },
    ],
  },
  suprimentos: {
    chave: "categoria-suprimentos",
    titulo: "Suprimentos",
    descricao: "Compras e suprimentos da operação.",
    itens: [],
  },
};
