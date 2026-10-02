import { useEffect, useState } from "react";

/** Cada ciclo começa no dia 10, à meia-noite de Brasília; os protocolos antigos permanecem salvos. */
export function cicloProtocolacao(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const ano = valor("year");
  const mes = valor("month");
  const dia = valor("day");
  const inicio = new Date(Date.UTC(ano, mes - (dia < 10 ? 2 : 1), 10));
  const proximo = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 10));
  const data = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return {
    // Brasília opera em UTC−3; inclusive no dia 10 a virada ocorre às 03:00 UTC.
    inicio: `${data(inicio)}T03:00:00Z`,
    fim: `${data(proximo)}T03:00:00Z`,
    rotulo: `10/${String(inicio.getUTCMonth() + 1).padStart(2, "0")}/${inicio.getUTCFullYear()} a 09/${String(proximo.getUTCMonth() + 1).padStart(2, "0")}/${proximo.getUTCFullYear()}`,
  };
}

export function useCicloProtocolacao() {
  const [ciclo, setCiclo] = useState(() => cicloProtocolacao());
  useEffect(() => {
    const atualizar = () => setCiclo((anterior) => {
      const atual = cicloProtocolacao();
      return anterior.inicio === atual.inicio ? anterior : atual;
    });
    atualizar();
    const intervalo = window.setInterval(atualizar, 30_000);
    return () => window.clearInterval(intervalo);
  }, []);
  return ciclo;
}