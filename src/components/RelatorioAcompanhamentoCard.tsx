import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Route as RouteIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { corDoUsuario } from "@/lib/cores-rastreio";
import { relatorioAcompanhamento, type LinhaAcompanhamento } from "@/lib/rastreamento.functions";

function hoje() {
  const d = new Date();
  const fuso = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return fuso.toISOString().slice(0, 10);
}

function hora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duracao(min: number) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

/** Relatório de acompanhamento: por onde o supervisor passou no período. */
export function RelatorioAcompanhamentoCard() {
  const gerar = useServerFn(relatorioAcompanhamento);
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(hoje());
  const [linhas, setLinhas] = useState<LinhaAcompanhamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await gerar({ data: { de, ate } }));
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

  const exportarCsv = () => {
    const cab = [
      "Supervisor",
      "Início",
      "Fim",
      "Pontos",
      "Distância (km)",
      "Parada início",
      "Parada fim",
      "Tempo parado",
      "Latitude",
      "Longitude",
      "Street View",
    ];
    const linhasCsv: string[][] = [];
    for (const l of linhas) {
      if (l.paradas.length === 0) {
        linhasCsv.push([
          l.nome,
          hora(l.primeiroEm),
          hora(l.ultimoEm),
          String(l.pontos),
          String(l.distanciaKm),
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
        continue;
      }
      for (const p of l.paradas) {
        linhasCsv.push([
          l.nome,
          hora(l.primeiroEm),
          hora(l.ultimoEm),
          String(l.pontos),
          String(l.distanciaKm),
          hora(p.inicio),
          hora(p.fim),
          duracao(p.minutos),
          p.latitude.toFixed(6),
          p.longitude.toFixed(6),
          `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.latitude},${p.longitude}`,
        ]);
      }
    }
    const csv = [cab, ...linhasCsv]
      .map((linha) => linha.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `acompanhamento-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <RouteIcon className="size-4 text-primary" />
          Relatório de acompanhamento
        </h2>
        <Button size="sm" variant="outline" onClick={exportarCsv} disabled={linhas.length === 0}>
          <Download className="size-4" /> Exportar
        </Button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Percurso registrado pelos supervisores: horários, distância percorrida e locais onde
        permaneceram.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
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
          {carregando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
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
          Nenhum deslocamento registrado nesse período.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {linhas.map((l) => (
          <div key={l.userId} className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setAberto(aberto === l.userId ? null : l.userId)}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className="inline-block size-3 shrink-0 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: corDoUsuario(l.userId) }}
                  aria-hidden
                />
                {l.nome}
              </span>
              <span className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  {hora(l.primeiroEm)} → {hora(l.ultimoEm)}
                </span>
                <span>{l.distanciaKm} km</span>
                <span>{l.paradas.length} local(is)</span>
              </span>
            </button>

            {aberto === l.userId ? (
              <ul className="divide-y divide-border border-t border-border">
                {l.paradas.map((p, i) => (
                  <li
                    key={`${p.inicio}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs"
                  >
                    <span className="font-medium">
                      {hora(p.inicio)} — {hora(p.fim)}
                    </span>
                    <span className="text-muted-foreground">permaneceu {duracao(p.minutos)}</span>
                    <a
                      href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary hover:underline"
                    >
                      Ver local
                    </a>
                  </li>
                ))}
                {l.paradas.length === 0 ? (
                  <li className="px-4 py-2 text-xs text-muted-foreground">
                    Sem permanências longas — apenas deslocamento.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
