import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, BarChart3, ClipboardCheck, Star, Users } from "lucide-react";

import { KpiCard } from "@/components/KpiCard";
import { PostosServicoMapaCard } from "@/components/PostosServicoMapaCard";
import { useVisits } from "@/lib/use-visits";
import { classificarResposta, type Visit } from "@/lib/report-parser";
import { gerenteAreaACanonico } from "@/lib/gerentes-area-a";
import { coordenadorDoGerente, rotuloCoordenador, type Coordenador } from "@/lib/coordenadores";

export const Route = createFileRoute("/_authenticated/coordenacao-painel/$coord")({
  beforeLoad: ({ params }) => {
    if (params.coord !== "vanderlei" && params.coord !== "jefferson") throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `Painel da coordenação ${params.coord}` },
      { name: "description", content: "Qualidade e quantidade de visitas por supervisor da coordenação, com mapa de postos." },
      { property: "og:title", content: `Painel da coordenação ${params.coord}` },
      { property: "og:description", content: "Dashboard de visitas por supervisor e mapa de postos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PainelCoordenador,
});

function coordDaVisita(v: Visit): Coordenador {
  const g =
    gerenteAreaACanonico(v.responsavel) ?? gerenteAreaACanonico(v.posto) ?? gerenteAreaACanonico(v.local) ?? "";
  return coordenadorDoGerente(g);
}

function qualidade(v: Visit) {
  let c = 0;
  let n = 0;
  for (const r of v.respostas) {
    const k = classificarResposta(r.answer, r.question);
    if (k === "conforme") c++;
    else if (k === "nao_conforme") n++;
  }
  return { c, t: c + n };
}

function tom(p: number) {
  if (p >= 90) return "bg-success";
  if (p >= 70) return "bg-warning";
  return "bg-destructive";
}

function PainelCoordenador() {
  const { coord } = Route.useParams();
  const alvo: Coordenador = coord === "vanderlei" ? "VANDERLEI" : "JEFFERSON";
  const { visits } = useVisits();

  const { linhas, total, media, postos } = useMemo(() => {
    const doCoord = visits.filter((v) => coordDaVisita(v) === alvo);
    const mapa = new Map<string, { visitas: number; c: number; t: number; postos: Set<string> }>();
    const todosPostos = new Set<string>();
    let gc = 0;
    let gt = 0;
    for (const v of doCoord) {
      const nome = v.responsavel.trim() || "Não informado";
      const posto = (v.local || v.posto || v.cliente).trim();
      const s = mapa.get(nome) ?? { visitas: 0, c: 0, t: 0, postos: new Set<string>() };
      const q = qualidade(v);
      s.visitas++;
      s.c += q.c;
      s.t += q.t;
      if (posto) {
        s.postos.add(posto);
        todosPostos.add(posto);
      }
      gc += q.c;
      gt += q.t;
      mapa.set(nome, s);
    }
    const linhas = Array.from(mapa.entries())
      .map(([nome, s]) => ({
        nome,
        visitas: s.visitas,
        postos: s.postos.size,
        qualidade: s.t ? Math.round((s.c / s.t) * 100) : 0,
      }))
      .sort((a, b) => b.visitas - a.visitas);
    return { linhas, total: doCoord.length, media: gt ? Math.round((gc / gt) * 100) : 0, postos: todosPostos.size };
  }, [visits, alvo]);

  const maxVisitas = Math.max(1, ...linhas.map((l) => l.visitas));

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <Link to="/coordenacao" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
        <ArrowLeft className="size-3.5" /> Coordenação
      </Link>
      <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
        <BarChart3 className="size-8 text-primary" /> {rotuloCoordenador(alvo)}
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Visitas" value={total} icon={ClipboardCheck} />
        <KpiCard label="Supervisores" value={linhas.length} icon={Users} />
        <KpiCard label="Postos visitados" value={postos} icon={BarChart3} tone="accent" />
        <KpiCard label="Qualidade média" value={`${media}%`} icon={Star} tone={media >= 90 ? "success" : media >= 70 ? "accent" : "destructive"} />
      </div>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Qualidade e quantidade de visitas por supervisor</h2>
        {linhas.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">Nenhuma visita encontrada para esta coordenação.</p>
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
