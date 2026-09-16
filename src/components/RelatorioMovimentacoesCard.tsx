import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadCsv } from "@/lib/dashboard-utils";
import {
  relatorioMovimentacoesPosto,
  type MovimentacaoRelatorio,
} from "@/lib/movimentacao-posto.functions";

function hoje() {
  const d = new Date();
  const fuso = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return fuso.toISOString().slice(0, 10);
}

function ha30dias() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const fuso = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return fuso.toISOString().slice(0, 10);
}

function dataHora(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
};

const COR_STATUS: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-600",
  aprovada: "bg-emerald-500/10 text-emerald-600",
  recusada: "bg-destructive/10 text-destructive",
};

/** Relatório de movimentações de posto feitas no período. */
export function RelatorioMovimentacoesCard() {
  const gerar = useServerFn(relatorioMovimentacoesPosto);
  const [de, setDe] = useState(ha30dias());
  const [ate, setAte] = useState(hoje());
  const [linhas, setLinhas] = useState<MovimentacaoRelatorio[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await gerar({ data: { de, ate } });
      if (!r.ok) {
        setErro(r.erro);
        setLinhas([]);
        return;
      }
      setLinhas(r.movimentacoes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [gerar, de, ate]);

  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportar = () => {
    downloadCsv(
      `movimentacoes-${de}-a-${ate}.csv`,
      [
        "Protocolo",
        "Status",
        "Data da movimentação",
        "Colaborador",
        "Cargo",
        "Posto atual",
        "Novo posto",
        "Motivo",
        "Registrado por",
        "Registrado em",
        "Assinado por",
        "Assinado em",
        "IP da assinatura",
        "Localização da assinatura",
        "Decidido por",
        "Decidido em",
        "Motivo da recusa",
        "Enviado à NEXTI em",
      ],
      linhas.map((l) => [
        l.protocolo,
        ROTULO_STATUS[l.status] ?? l.status,
        dataBr(l.data_movimentacao),
        l.colaborador,
        l.cargo ?? "",
        l.posto_atual,
        l.novo_posto,
        l.motivo,
        l.criado_por_nome ?? "",
        dataHora(l.created_at),
        l.assinatura_nome ?? "",
        dataHora(l.assinatura_em),
        l.assinatura_ip ?? "",
        l.assinatura_latitude !== null && l.assinatura_longitude !== null
          ? `${l.assinatura_latitude}, ${l.assinatura_longitude}`
          : (l.assinatura_geo_status ?? ""),
        l.aprovado_por_nome ?? "",
        dataHora(l.aprovado_em),
        l.motivo_recusa ?? "",
        dataHora(l.enviado_nexti_em),
      ]),
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-5 text-primary" />
              Relatório de movimentações
            </CardTitle>
            <CardDescription className="mt-1">
              Todas as movimentações de posto registradas no período, com situação, assinatura e
              decisão da coordenação.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={exportar} disabled={linhas.length === 0}>
            <Download className="size-4" /> Exportar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium">
            <span className="block text-muted-foreground">De</span>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium">
            <span className="block text-muted-foreground">Até</span>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <Button size="sm" onClick={() => void buscar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Gerar
          </Button>
        </div>

        {erro ? (
          <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {erro}
          </p>
        ) : null}

        {!carregando && !erro && linhas.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Nenhuma movimentação registrada nesse período.
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          {linhas.length > 0 ? (
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Protocolo</th>
                  <th className="px-3 py-2 font-semibold">Data</th>
                  <th className="px-3 py-2 font-semibold">Colaborador</th>
                  <th className="px-3 py-2 font-semibold">De → Para</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                  <th className="px-3 py-2 font-semibold">Assinatura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l) => (
                  <tr key={l.id} className="align-top hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono">{l.protocolo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dataBr(l.data_movimentacao)}</td>
                    <td className="px-3 py-2">
                      <span className="block font-semibold">{l.colaborador}</span>
                      <span className="text-muted-foreground">{l.cargo ?? ""}</span>
                    </td>
                    <td className="px-3 py-2">
                      {l.posto_atual} <span aria-hidden>→</span> {l.novo_posto}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_STATUS[l.status] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {ROTULO_STATUS[l.status] ?? l.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {l.assinatura_em ? (
                        <>
                          <span className="block">{l.assinatura_nome ?? "Assinado"}</span>
                          <span className="text-muted-foreground">{dataHora(l.assinatura_em)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Aguardando</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
