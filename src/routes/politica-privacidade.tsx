import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Home } from "lucide-react";

export const Route = createFileRoute("/politica-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade e LGPD" },
      {
        name: "description",
        content:
          "Como coletamos, armazenamos e usamos dados pessoais conforme a Lei nº 13.709/2018 (LGPD).",
      },
      { property: "og:title", content: "Política de Privacidade e LGPD" },
      {
        property: "og:description",
        content:
          "Bases legais, finalidades, prazos de retenção e direitos do titular conforme a LGPD.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PoliticaPrivacidadePage,
});

const SECOES: { titulo: string; itens: string[] }[] = [
  {
    titulo: "1. Quem trata os dados",
    itens: [
      "A empresa atua como controladora dos dados pessoais tratados nesta plataforma.",
      "O Encarregado (DPO) é o canal oficial para pedidos e reclamações do titular; seus dados de contato ficam disponíveis na página LGPD do sistema.",
    ],
  },
  {
    titulo: "2. Quais dados coletamos",
    itens: [
      "Dados de identificação: nome, matrícula, e-mail corporativo, cargo, posto e empresa.",
      "Dados operacionais: marcações de ponto, faltas, escalas, visitas e protocolos de entrega.",
      "Dados sensíveis de saúde: atestados médicos, CID e período de afastamento — tratados apenas para cumprimento de obrigação trabalhista e tutela da saúde.",
      "Registros de uso: data, hora, endereço IP e ações realizadas no sistema.",
    ],
  },
  {
    titulo: "3. Bases legais e finalidades (arts. 7º e 11)",
    itens: [
      "Cumprimento de obrigação legal e regulatória trabalhista (art. 7º, II).",
      "Execução do contrato de trabalho e procedimentos preliminares (art. 7º, V).",
      "Exercício regular de direitos em processo (art. 7º, VI).",
      "Tutela da saúde, em procedimento realizado por profissionais de saúde (art. 11, II, 'f'), para atestados.",
      "Consentimento, quando o tratamento não se enquadrar nas hipóteses acima (art. 7º, I).",
    ],
  },
  {
    titulo: "4. Princípios aplicados",
    itens: [
      "Finalidade: cada acesso a dado pessoal é registrado com finalidade e base legal.",
      "Necessidade e minimização: coletamos apenas o mínimo necessário para cada módulo.",
      "Segurança: acesso restrito por perfil e permissão de página, criptografia em trânsito e trilha de auditoria.",
      "Transparência e prestação de contas: histórico de acessos e de solicitações disponível ao titular.",
    ],
  },
  {
    titulo: "5. Compartilhamento",
    itens: [
      "Dados podem ser compartilhados com órgãos públicos quando exigido por lei e com operadores contratados (infraestrutura em nuvem e integração com o sistema de gestão de pessoas).",
      "Não vendemos, alugamos ou cedemos dados pessoais para fins publicitários.",
    ],
  },
  {
    titulo: "6. Retenção e eliminação",
    itens: [
      "Os prazos de guarda seguem a legislação trabalhista e previdenciária e ficam configurados por módulo na página LGPD.",
      "Ao final do prazo, os dados são eliminados ou anonimizados, salvo obrigação legal de guarda.",
    ],
  },
  {
    titulo: "7. Direitos do titular (art. 18)",
    itens: [
      "Confirmação da existência de tratamento e acesso aos dados.",
      "Correção de dados incompletos, inexatos ou desatualizados.",
      "Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.",
      "Portabilidade e exportação dos dados em formato legível por máquina.",
      "Informação sobre compartilhamento e sobre a possibilidade de não consentir.",
      "Revogação do consentimento, quando esta for a base legal aplicada.",
    ],
  },
  {
    titulo: "8. Incidentes de segurança (art. 48)",
    itens: [
      "Incidentes que possam acarretar risco relevante são registrados, tratados e comunicados à ANPD e aos titulares afetados em prazo razoável.",
    ],
  },
];

function PoliticaPrivacidadePage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="size-4" />
            Início
          </Link>
          <ShieldCheck className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Política de Privacidade</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709/2018 (LGPD)
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        {SECOES.map((s) => (
          <section key={s.titulo}>
            <h2 className="text-lg font-semibold text-foreground">{s.titulo}</h2>
            <ul className="mt-3 space-y-2">
              {s.itens.map((i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="border-t border-border pt-6 text-xs text-muted-foreground">
          Para exercer seus direitos, acesse a página LGPD dentro do sistema e abra uma solicitação
          ao Encarregado. O prazo de resposta padrão é de 15 dias.
        </p>
      </div>
    </main>
  );
}
