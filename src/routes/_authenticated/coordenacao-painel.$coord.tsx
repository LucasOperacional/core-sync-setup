import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, ClipboardCheck, Star, Users } from "lucide-react";

import { KpiCard } from "@/components/KpiCard";
import { PostosServicoMapaCard } from "@/components/PostosServicoMapaCard";
import { supabase } from "@/integrations/supabase/client";
import { gerenteAreaACanonico } from "@/lib/gerentes-area-a";
import { coordenadorDoGerente, rotuloCoordenador, type Coordenador } from "@/lib/coordenadores";

export const Route = createFileRoute("/_authenticated/coordenacao-painel/$coord")({
  beforeLoad: ({ params }) => {
    if (params.coord !== "vanderlei" && params.coord !== "jefferson") throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `Painel da coordenação ${params.coord}` },
      { name: "description", content: "Qualidade e quantidade de visitas da Supervisão em Campo por supervisor, com mapa de postos." },
      { property: "og:title", content: `Painel da coordenação ${params.coord}` },
      { property: "og:description", content: "Dashboard de visitas da Supervisão em Campo por supervisor e mapa de postos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PainelCoordenador,
});

type VisitaCampo = {
  supervisor: string | null;
  posto: string | null;
  cliente: string | null;
  percentual_conformidade: number | null;
};

function coordDaVisita(v: VisitaCampo): Coordenador {
  const g = gerenteAreaACanonico(v.supervisor ?? "") ?? gerenteAreaACanonico(v.posto ?? "") ?? "";
  return coordenadorDoGerente(g);
}

function tom(p: number) {
  if (p >= 90) return "bg-success";
  if (p >= 70) return "bg-warning";
  return "bg-destructive";
}

function PainelCoordenador() {
  const { coord } = Route.useParams();
  const alvo: Coordenador = coord === "vanderlei" ? "VANDERLEI" : "JEFFERSON";
  const [visitas, setVisitas] = useState<VisitaCampo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    async function carregar() {
      setCarregando(true);
      const acumulado: VisitaCampo[] = [];
      let desde = 0;
      const passo = 1000;
      for (;;) {
        const { data, error } = await supabase
          .from("roteiros_visita_campo")
          .select("supervisor, posto, cliente, percentual_conformidade")
          .order("data_visita", { ascending: false })
          .range(desde, desde + passo - 1);
        if (error || !data || data.length === 0) break;
        acumulado.push(...(data as VisitaCampo[]));
        if (data.length < passo) break;
        desde += passo;
      }
      if (vivo) {
        setVisitas(acumulado);
        setCarregando(false);
      }
    }
    void carregar();
    return () => {
      vivo = false;
    };
  }, []);

  const [aberto, setAberto] = useState<string | null>(null);

  const { linhas, total, media, postos } = useMemo(() => {
    const doCoord = visitas.filter((v) => coordDaVisita(v) === alvo);
    const mapa = new Map<
      string,
      { visitas: number; soma: number; comNota: number; postos: Map<string, number> }
    >();
    const todosPostos = new Set<string>();
    let somaGeral = 0;
    let comNotaGeral = 0;
    for (const v of doCoord) {
      const nome = (v.supervisor ?? "").trim() || "Não informado";
      const posto = (v.posto || v.cliente || "").trim();
      const s = mapa.get(nome) ?? { visitas: 0, soma: 0, comNota: 0, postos: new Map<string, number>() };
      s.visitas++;
      if (typeof v.percentual_conformidade === "number") {
        s.soma += v.percentual_conformidade;
        s.comNota++;
        somaGeral += v.percentual_conformidade;
        comNotaGeral++;
      }
      if (posto) {
        s.postos.set(posto, (s.postos.get(posto) ?? 0) + 1);
        todosPostos.add(posto);
      }
      mapa.set(nome, s);
    }
    const linhas = Array.from(mapa.entries())
      .map(([nome, s]) => ({
        nome,
        visitas: s.visitas,
        postos: s.postos.size,
        qualidade: s.comNota ? Math.round(s.soma / s.comNota) : 0,
        listaPostos: Array.from(s.postos.entries())
          .map(([posto, qtd]) => ({ posto, qtd }))
          .sort((a, b) => b.qtd - a.qtd || a.posto.localeCompare(b.posto)),
      }))
      .sort((a, b) => b.visitas - a.visitas);
    return {
      linhas,
      total: doCoord.length,
      media: comNotaGeral ? Math.round(somaGeral / comNotaGeral) : 0,
      postos: todosPostos.size,
    };
  }, [visitas, alvo]);

  const maxVisitas = Math.max(1, ...linhas.map((l) => l.visitas));

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <Link to="/coordenacao" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
        <ArrowLeft className="size-3.5" /> Coordenação
      </Link>
      <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
        <BarChart3 className="size-8 text-primary" /> {rotuloCoordenador(alvo)}
      </h1>
      <p className="text-xs text-muted-foreground">
        Somente visitas registradas na Supervisão em Campo entram neste painel.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Visitas" value={total} icon={ClipboardCheck} />
        <KpiCard label="Supervisores" value={linhas.length} icon={Users} />
        <KpiCard label="Postos visitados" value={postos} icon={BarChart3} tone="accent" />
        <KpiCard label="Qualidade média" value={`${media}%`} icon={Star} tone={media >= 90 ? "success" : media >= 70 ? "accent" : "destructive"} />
      </div>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Qualidade e quantidade de visitas por supervisor</h2>
        {carregando ? (
          <p className="mt-4 text-xs text-muted-foreground">Carregando visitas da Supervisão em Campo…</p>
        ) : linhas.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">Nenhuma visita da Supervisão em Campo encontrada para esta coordenação.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Supervisor</th>
                  <th className="py-2 pr-3 font-medium">Visitas</th>
                  <th className="py-2 pr-3 font-medium">Postos</th>
                  <th className="py-2 font-medium">Qualidade</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.nome} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 font-medium">{l.nome}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 rounded bg-muted">
                          <div className="h-2 rounded bg-primary" style={{ width: `${(l.visitas / maxVisitas) * 100}%` }} />
                        </div>
                        <span className="tabular-nums">{l.visitas}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{l.postos}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 rounded bg-muted">
                          <div className={`h-2 rounded ${tom(l.qualidade)}`} style={{ width: `${l.qualidade}%` }} />
                        </div>
                        <span className="font-semibold tabular-nums">{l.qualidade}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PostosServicoMapaCard />
    </main>
  );
}
