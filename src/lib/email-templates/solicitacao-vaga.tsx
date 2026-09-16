import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  cargo?: string;
  posto?: string;
  localidade?: string;
  salario?: string;
  horario?: string;
  dataInicio?: string;
  solicitante?: string;
  tipo?: string;
  justificativa?: string;
  atividade?: string;
  perfil?: string;
  linkPdf?: string;
  arquivo?: string;
}

const Linha = ({ rotulo, valor }: { rotulo: string; valor?: string | undefined }) => (
  <Text style={linha}>
    <span style={rotuloStyle}>{rotulo}: </span>
    {valor && valor.trim() ? valor : "—"}
  </Text>
);

const Email = ({
  cargo,
  posto,
  localidade,
  salario,
  horario,
  dataInicio,
  solicitante,
  tipo,
  justificativa,
  atividade,
  perfil,
  linkPdf,
  arquivo,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`Solicitação de Pessoas — ${cargo || "nova vaga"}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Solicitação de Pessoas</Heading>
        <Text style={sub}>RE.DRU.03-SDP- · Rev.00</Text>

        <Section style={bloco}>
          <Linha rotulo="Cargo" valor={cargo} />
          <Linha rotulo="Tipo" valor={tipo} />
          <Linha rotulo="Depto / Posto" valor={posto} />
          <Linha rotulo="Localidade" valor={localidade} />
          <Linha rotulo="Salário" valor={salario} />
          <Linha rotulo="Horário" valor={horario} />
          <Linha rotulo="Data de início" valor={dataInicio} />
          <Linha rotulo="Solicitante" valor={solicitante} />
        </Section>

        <Hr style={hr} />
        <Text style={rotuloStyle}>Justificativa</Text>
        <Text style={linha}>{justificativa?.trim() ? justificativa : "—"}</Text>
        <Text style={rotuloStyle}>Descrição da atividade</Text>
        <Text style={linha}>{atividade?.trim() ? atividade : "—"}</Text>
        <Text style={rotuloStyle}>Perfil desejado</Text>
        <Text style={linha}>{perfil?.trim() ? perfil : "—"}</Text>

        {linkPdf ? (
          <Section style={{ paddingTop: "18px" }}>
            <Button href={linkPdf} style={botao}>
              Baixar PDF da solicitação
            </Button>
            <Text style={nota}>
              {`Arquivo: ${arquivo || "solicitacao-vaga.pdf"} · o link fica disponível por 7 dias.`}
            </Text>
          </Section>
        ) : null}
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Solicitação de Pessoas — ${data["cargo"] || "nova vaga"}`,
  displayName: "Solicitação de vaga",
  previewData: {
    cargo: "Porteiro",
    posto: "Portaria Diurno",
    localidade: "Centro",
    salario: "R$ 2.100,00",
    horario: "12x36 diurno",
    dataInicio: "01/10/2026",
    solicitante: "Bruna",
    tipo: "Reposição de vaga",
    justificativa: "Desligamento do colaborador anterior.",
    atividade: "Controle de acesso e rondas.",
    perfil: "Experiência em portaria, curso de vigilante desejável.",
    linkPdf: "https://example.com/solicitacao.pdf",
    arquivo: "solicitacao-vaga.pdf",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "600px" };
const h1 = { fontSize: "20px", margin: "0", color: "#0f172a" };
const sub = { fontSize: "12px", color: "#64748b", margin: "4px 0 16px" };
const bloco = { backgroundColor: "#f8fafc", borderRadius: "8px", padding: "12px 16px" };
const linha = { fontSize: "14px", color: "#0f172a", margin: "4px 0" };
const rotuloStyle = { fontWeight: "bold" as const, color: "#334155" };
const hr = { borderColor: "#e2e8f0", margin: "18px 0" };
const botao = {
  backgroundColor: "#1d4ed8",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "12px 20px",
  fontSize: "14px",
  fontWeight: "bold" as const,
  textDecoration: "none",
};
const nota = { fontSize: "12px", color: "#64748b", marginTop: "10px" };
