import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Building2, ClipboardCheck, Star } from "lucide-react";

import { KpiCard } from "@/components/KpiCard";
import { supabase } from "@/integrations/supabase/client";
import { rotuloCoordenador, type Coordenador } from "@/lib/coordenadores";
import { useVisitasPorNomePosto } from "@/lib/visitas-postos-nome";
import { SemaforoPosto } from "@/components/SemaforoPosto";
import { RelatorioRotaVisitas } from "@/components/RelatorioRotaVisitas";

export const Route = createFileRoute("/_authenticated/coordenacao-painel/$coord/supervisor/$nome")({
  beforeLoad: ({ params }) => {
    if (params.coord !== "vanderlei" && params.coord !== "jefferson") throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `Visitas de ${decodeURIComponent(params.nome)} — Supervisão em Campo` },
      { name: "description", content: "Dashboard das visitas da Supervisão em Campo do supervisor, com os postos visitados." },
      { property: "og:title", content: `Visitas de ${decodeURIComponent(params.nome)} — Supervisão em Campo` },
      { property: "og:description", content: "Dashboard das visitas da Supervisão em Campo do supervisor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaSupervisor,
});

type VisitaCampo = {
  id: string;
  data_visita: string | null;
  created_at: string;
  posto: string | null;
  cliente: string | null;
  empresa: string | null;
  colaborador: string | null;
  percentual_conformidade: number | null;
  total_conformes: number | null;
  total_nao_conformes: number | null;
  criticas_abertas: number | null;
};

function dataDaVisita(v: VisitaCampo): string {
  const bruta = v.data_visita ?? v.created_at;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruta);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : bruta.slice(0, 10);
}

function tom(p: number) {
  if (p >= 90) return "bg-success";
  if (p >= 70) return "bg-warning";
  return "bg-destructive";
}

function PaginaSupervisor() {
  const { coord, nome } = Route.useParams();
  const alvo: Coordenador = coord === "vanderlei" ? "VANDERLEI" : "JEFFERSON";
  const supervisor = decodeURIComponent(nome);
  const [visitas, setVisitas] = useState<VisitaCampo[]>([]);
  const [carregando, setCarregando] = useState(true);
  // Bolinha e quantidade de visitas de cada posto (mesma regra da tela de visitas).
  const { buscar } = useVisitasPorNomePosto();

  useEffect(() => {
    let vivo = true;
    async function carregar() {
      setCarregando(true);
      const { data } = await supabase
        .from("roteiros_visita_campo")
        .select(
          "id,data_visita,created_at,posto,cliente,empresa,colaborador,percentual_conformidade,total_conformes,total_nao_conformes,criticas_abertas",
        )
        .eq("supervisor", supervisor)
        .order("data_visita", { ascending: false })
        .limit(1000);
      if (vivo) {
        setVisitas((data as VisitaCampo[] | null) ?? []);
        setCarregando(false);
      }
    }
    void carregar();
    return () => {
      vivo = false;
    };
  }, [supervisor]);

  const { postos, media, conformes, naoConformes, criticas } = useMemo(() => {
    const mapa = new Map<string, { qtd: number; soma: number; comNota: number; ultima: string }>();
    let soma = 0;
    let comNota = 0;
    let c = 0;
    let n = 0;
    let crit = 0;
    for (const v of visitas) {
      const posto = (v.posto || v.cliente || "").trim() || "Não identificado";
      const s = mapa.get(posto) ?? { qtd: 0, soma: 0, comNota: 0, ultima: "" };
      s.qtd++;
      const d = dataDaVisita(v);
      if (d > s.ultima) s.ultima = d;
      if (typeof v.percentual_conformidade === "number") {
        s.soma += v.percentual_conformidade;
        s.comNota++;
        soma += v.percentual_conformidade;
        comNota++;
      }
      c += v.total_conformes ?? 0;
      n += v.total_nao_conformes ?? 0;
      crit += v.criticas_abertas ?? 0;
      mapa.set(posto, s);
    }
    const postos = Array.from(mapa.entries())
      .map(([posto, s]) => ({
        posto,
        qtd: s.qtd,
        qualidade: s.comNota ? Math.round(s.soma / s.comNota) : 0,
        ultima: s.ultima,
      }))
      .sort((a, b) => b.qtd - a.qtd || a.posto.localeCompare(b.posto));
    return {
      postos,
      media: comNota ? Math.round(soma / comNota) : 0,
      conformes: c,
      naoConformes: n,
      criticas: crit,
    };
  }, [visitas]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <Link
        to="/coordenacao-painel/$coord"
        params={{ coord }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="size-3.5" /> {rotuloCoordenador(alvo)}
      </Link>
      <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
        <ClipboardCheck className="size-8 text-primary" /> {supervisor}
      </h1>
      <p className="text-xs text-muted-foreground">
        Dashboard das visitas registradas por este supervisor na Supervisão em Campo.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Visitas" value={visitas.length} icon={ClipboardCheck} />
        <KpiCard label="Postos visitados" value={postos.length} icon={Building2} tone="accent" />
        <KpiCard
          label="Qualidade média"
          value={`${media}%`}
          icon={Star}
          tone={media >= 90 ? "success" : media >= 70 ? "accent" : "destructive"}
        />
        <KpiCard label="Não conformidades" value={naoConformes} icon={BarChart3} tone={naoConformes > 0 ? "destructive" : "success"} />
      </div>

      <RelatorioRotaVisitas supervisor={supervisor} />

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Postos visitados ({postos.length})</h2>
        {carregando ? (
          <p className="mt-4 text-xs text-muted-foreground">Carregando visitas…</p>
        ) : postos.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">Nenhuma visita da Supervisão em Campo encontrada para este supervisor.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Posto</th>
                  <th className="py-2 pr-3 font-medium">Visitas</th>
                  <th className="py-2 pr-3 font-medium">Última visita</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 font-medium">Qualidade</th>
                </tr>
              </thead>
              <tbody>
                {postos.map((p) => (
                  <tr key={p.posto} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 font-medium">{p.posto}</td>
                    <td className="py-2 pr-3 tabular-nums">{p.qtd}</td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{p.ultima || "—"}</td>
                    <td className="py-2 pr-3">
                      <SemaforoPosto qtd={buscar(p.posto)?.qtd} />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 rounded bg-muted">
                          <div className={`h-2 rounded ${tom(p.qualidade)}`} style={{ width: `${p.qualidade}%` }} />
                        </div>
                        <span className="font-semibold tabular-nums">{p.qualidade}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Visitas realizadas ({visitas.length})</h2>
        {!carregando && visitas.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Posto</th>
                  <th className="py-2 pr-3 font-medium">Colaborador</th>
                  <th className="py-2 pr-3 font-medium">Conformes</th>
                  <th className="py-2 pr-3 font-medium">Não conformes</th>
                  <th className="py-2 font-medium">Conformidade</th>
                </tr>
              </thead>
              <tbody>
                {visitas.map((v) => (
                  <tr key={v.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{dataDaVisita(v)}</td>
                    <td className="py-2 pr-3 font-medium">{(v.posto || v.cliente || "—").trim() || "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{v.colaborador || "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">{v.total_conformes ?? 0}</td>
                    <td className="py-2 pr-3 tabular-nums">{v.total_nao_conformes ?? 0}</td>
                    <td className="py-2 font-semibold tabular-nums">
                      {typeof v.percentual_conformidade === "number" ? `${Math.round(v.percentual_conformidade)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Resumo do período: {conformes} itens conformes, {naoConformes} não conformes e {criticas} críticas abertas.
      </p>
    </main>
  );
}
