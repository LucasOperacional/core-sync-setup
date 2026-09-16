import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Award, Crown, MapPin, Medal, Search, Trophy } from "lucide-react";
import { slugifyGerente } from "@/lib/use-visits";

export type GerenteRanking = {
  nome: string;
  cargo: string;
  visitas: number;
  visitasMes: number;
  clientes: number;
  respostas: number;
  conformes: number;
  naoConformes: number;
  taxa: number;
  tempoMedio: number | null;
  locais: [string, number][];
};

type Props = {
  gerentes: GerenteRanking[];
  mesLabel?: string | undefined;
};

type Ordem = "conformidade" | "visitas" | "naoConformes" | "clientes";

const ordens: { valor: Ordem; label: string }[] = [
  { valor: "conformidade", label: "Conformidade" },
  { valor: "visitas", label: "Visitas" },
  { valor: "naoConformes", label: "Não conformidades" },
  { valor: "clientes", label: "Clientes atendidos" },
];

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "?";
  const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return `${a}${b}`.toUpperCase();
}

function corTaxa(taxa: number) {
  if (taxa >= 90) return "text-success";
  if (taxa >= 70) return "text-yellow-400";
  return "text-destructive";
}

function barraTaxa(taxa: number) {
  if (taxa >= 90) return "bg-success";
  if (taxa >= 70) return "bg-yellow-400";
  return "bg-destructive";
}

const posicaoEstilo = [
  { anel: "ring-yellow-400/70", chip: "bg-yellow-400/15 text-yellow-300", Icone: Crown },
  { anel: "ring-slate-300/60", chip: "bg-slate-300/15 text-slate-200", Icone: Medal },
  { anel: "ring-amber-600/60", chip: "bg-amber-600/15 text-amber-500", Icone: Award },
];

export function RankingGerentes({ gerentes, mesLabel }: Props) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("conformidade");
  const [somenteAtivos, setSomenteAtivos] = useState(false);
  const [expandido, setExpandido] = useState(false);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrada = gerentes.filter((g) => {
      if (somenteAtivos && g.visitas === 0) return false;
      if (!termo) return true;
      return (
        g.nome.toLowerCase().includes(termo) ||
        g.cargo.toLowerCase().includes(termo) ||
        g.locais.some(([l]) => l.toLowerCase().includes(termo))
      );
    });
    const ordenada = filtrada.slice().sort((a, b) => {
      const ativo = Number(b.visitas > 0) - Number(a.visitas > 0);
      if (ativo !== 0) return ativo;
      if (ordem === "visitas") return b.visitas - a.visitas || b.taxa - a.taxa;
      if (ordem === "clientes") return b.clientes - a.clientes || b.taxa - a.taxa;
      if (ordem === "naoConformes") return b.naoConformes - a.naoConformes || b.visitas - a.visitas;
      return b.taxa - a.taxa || b.visitas - a.visitas;
    });
    return ordenada;
  }, [gerentes, busca, ordem, somenteAtivos]);

  const resumo = useMemo(() => {
    const ativos = gerentes.filter((g) => g.visitas > 0);
    const respostas = ativos.reduce((acc, g) => acc + g.respostas, 0);
    const conformes = ativos.reduce((acc, g) => acc + g.conformes, 0);
    return {
      ativos: ativos.length,
      total: gerentes.length,
      media: respostas ? Math.round((conformes / respostas) * 100) : 0,
      visitas: ativos.reduce((acc, g) => acc + g.visitas, 0),
      nc: ativos.reduce((acc, g) => acc + g.naoConformes, 0),
    };
  }, [gerentes]);

  const maxVisitas = Math.max(1, ...lista.map((g) => g.visitas));
  const podio = lista.filter((g) => g.visitas > 0).slice(0, 3);
  const visiveis = expandido ? lista : lista.slice(0, 9);

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Trophy className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Ranking de Gerentes de Área · Top 9</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {resumo.ativos} de {resumo.total} com visitas no período · média de conformidade{" "}
              <strong className={corTaxa(resumo.media)}>{resumo.media}%</strong> · {resumo.visitas}{" "}
              visita(s) · {resumo.nc} NC
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar gerente, cargo ou local"
              className="h-9 w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
            />
          </label>
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            aria-label="Ordenar ranking por"
          >
            {ordens.map((o) => (
              <option key={o.valor} value={o.valor}>
                Ordenar por: {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSomenteAtivos((v) => !v)}
            className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
              somenteAtivos
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Somente com visitas
          </button>
        </div>
      </div>

      {podio.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {podio.map((g, idx) => {
            const estilo = posicaoEstilo[idx] ?? posicaoEstilo[0]!;
            const Icone = estilo.Icone;
            return (
              <div
                key={g.nome}
                className={`rounded-xl border border-border bg-secondary/40 p-4 ring-1 ${estilo.anel}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-sm font-bold">
                    {iniciais(g.nome)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.nome}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {g.cargo || "Gerente de área"}
                    </p>
                  </div>
                  <span
                    className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${estilo.chip}`}
                  >
                    <Icone className="size-3.5" /> {idx + 1}º
                  </span>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <span className={`font-display text-2xl font-bold ${corTaxa(g.taxa)}`}>
                    {g.taxa}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {g.visitas} visita(s) · {g.naoConformes} NC
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${barraTaxa(g.taxa)}`}
                    style={{ width: `${g.taxa}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabela (desktop) */}
      <div className="mt-5 hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 pl-2 pr-4 font-medium">#</th>
              <th className="pb-2 pr-4 font-medium">Gerente</th>
              <th className="pb-2 pr-4 font-medium">Conformidade</th>
              <th className="pb-2 pr-4 font-medium">Visitas</th>
              <th className="pb-2 pr-4 text-right font-medium">
                No mês {mesLabel ? `(${mesLabel})` : ""}
              </th>
              <th className="pb-2 pr-4 text-right font-medium">Clientes</th>
              <th className="pb-2 pr-4 text-right font-medium">NC</th>
              <th className="pb-2 pr-4 text-right font-medium">Tempo médio</th>
              <th className="pb-2 pr-4 font-medium">Top locais</th>
              <th className="pb-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((g, idx) => (
              <tr
                key={g.nome}
                className="border-b border-border/50 transition-colors hover:bg-secondary/60"
              >
                <td className="py-3 pl-2 pr-4 font-semibold text-muted-foreground">{idx + 1}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold">
                      {iniciais(g.nome)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{g.nome}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{g.cargo || "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${barraTaxa(g.taxa)}`}
                        style={{ width: `${g.taxa}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold ${corTaxa(g.taxa)}`}>{g.taxa}%</span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(g.visitas / maxVisitas) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums">{g.visitas}</span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{g.visitasMes}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{g.clientes}</td>
                <td
                  className={`py-3 pr-4 text-right tabular-nums ${
                    g.naoConformes > 0 ? "font-semibold text-destructive" : ""
                  }`}
                >
                  {g.naoConformes}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">
                  {g.tempoMedio != null ? `${g.tempoMedio} min` : "—"}
                </td>
                <td className="py-3 pr-4 text-xs text-muted-foreground">
                  {g.locais
                    .slice(0, 2)
                    .map(([l, n]) => `${l} (${n})`)
                    .join(", ") || "—"}
                </td>
                <td className="py-3 pr-4">
                  {g.visitas > 0 && (
                    <Link
                      to="/gerentes/$slug"
                      params={{ slug: slugifyGerente(g.nome) }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <MapPin className="size-3" /> Detalhar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards (mobile) */}
      <div className="mt-5 space-y-3 md:hidden">
        {visiveis.map((g, idx) => (
          <div key={g.nome} className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{g.nome}</p>
                <p className="truncate text-[11px] text-muted-foreground">{g.cargo || "—"}</p>
              </div>
              <span className={`text-lg font-bold ${corTaxa(g.taxa)}`}>{g.taxa}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${barraTaxa(g.taxa)}`}
                style={{ width: `${g.taxa}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {g.visitas} visita(s) · {g.visitasMes} no mês · {g.clientes} cliente(s) ·{" "}
              {g.naoConformes} NC ·{" "}
              {g.tempoMedio != null ? `${g.tempoMedio} min médios` : "tempo n/d"}
            </p>
            {g.visitas > 0 && (
              <Link
                to="/gerentes/$slug"
                params={{ slug: slugifyGerente(g.nome) }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <MapPin className="size-3" /> Detalhar
              </Link>
            )}
          </div>
        ))}
      </div>

      {lista.length === 0 && (
        <p className="mt-5 text-sm text-muted-foreground">
          Nenhum gerente encontrado com os filtros aplicados.
        </p>
      )}

      {lista.length > 9 && (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="mt-4 text-xs font-semibold text-primary hover:underline"
        >
          {expandido ? "Mostrar menos" : `Mostrar todos (${lista.length})`}
        </button>
      )}
    </section>
  );
}
