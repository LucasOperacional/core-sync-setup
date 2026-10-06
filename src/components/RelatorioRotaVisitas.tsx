import { lazy, Suspense, useState } from "react";
import { MapPinned, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fotoSupervisorPorNome } from "@/lib/rastreamento.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PontoRota } from "@/components/MapaRotaVisitas";

const MapaRotaVisitas = lazy(() => import("@/components/MapaRotaVisitas"));

type Visita = {
  id: string;
  data_visita: string | null;
  created_at: string;
  posto: string | null;
  cliente: string | null;
  posto_nexti_id?: string | number | null;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function hojeISO(diasAtras = 0) {
  const d = new Date(Date.now() - diasAtras * 86400000);
  return d.toISOString().slice(0, 10);
}

export function RelatorioRotaVisitas({ supervisor }: { supervisor: string }) {
  const [de, setDe] = useState(hojeISO(30));
  const [ate, setAte] = useState(hojeISO());
  const [pontos, setPontos] = useState<PontoRota[] | null>(null);
  const [semLocal, setSemLocal] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  async function gerar() {
    setCarregando(true);
    // Foto do supervisor (bucket privado user-avatars, URL assinada de 1h).
    const foto = await fotoSupervisorPorNome({ data: { nome: supervisor } }).catch(() => null);
    setFotoUrl(foto);
    const { data } = await supabase
      .from("roteiros_visita_campo")
      .select("id,data_visita,created_at,posto,cliente,posto_nexti_id")
      .eq("supervisor", supervisor)
      .gte("created_at", `${de}T00:00:00-03:00`)
      .lte("created_at", `${ate}T23:59:59-03:00`)
      .order("created_at", { ascending: true })
      .limit(1000);
    const visitas = (data as Visita[] | null) ?? [];
    const ids = [...new Set(visitas.map((v) => v.posto_nexti_id).filter(Boolean).map(String))];
    const nomes = [...new Set(visitas.map((v) => (v.posto || v.cliente || "").trim()).filter(Boolean))];
    const locais: { nexti_id: unknown; name: string | null; latitude: number | null; longitude: number | null }[] = [];
    if (ids.length) {
      const r = await supabase.from("nexti_workplaces").select("nexti_id,name,latitude,longitude").in("nexti_id", ids as never);
      locais.push(...((r.data as typeof locais) ?? []));
    }
    if (nomes.length) {
      const r = await supabase.from("nexti_workplaces").select("nexti_id,name,latitude,longitude").in("name", nomes);
      locais.push(...((r.data as typeof locais) ?? []));
    }
    const porId = new Map<string, [number, number]>();
    const porNome = new Map<string, [number, number]>();
    for (const l of locais) {
      if (l.latitude == null || l.longitude == null) continue;
      const c: [number, number] = [Number(l.latitude), Number(l.longitude)];
      if (l.nexti_id != null) porId.set(String(l.nexti_id), c);
      if (l.name) porNome.set(norm(l.name), c);
    }
    const out: PontoRota[] = [];
    const faltando = new Set<string>();
    for (const v of visitas) {
      const nome = (v.posto || v.cliente || "Não identificado").trim();
      const c = (v.posto_nexti_id != null && porId.get(String(v.posto_nexti_id))) || porNome.get(norm(nome));
      if (!c) {
        faltando.add(nome);
        continue;
      }
      out.push({
        lat: c[0],
        lng: c[1],
        posto: nome,
        data: new Date(v.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        ordem: out.length + 1,
      });
    }
    setPontos(out);
    setSemLocal([...faltando]);
    setCarregando(false);
  }

  return (
    <section className="panel space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MapPinned className="size-4 text-primary" /> Mapa de relatório da rota de visitas
        </h2>
        <p className="text-xs text-muted-foreground">
          Escolha o período e gere o mapa com o caminho percorrido pelo supervisor, na ordem das visitas.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs">
          De
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="mt-1 w-40" />
        </label>
        <label className="text-xs">
          Até
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="mt-1 w-40" />
        </label>
        <Button onClick={gerar} disabled={carregando}>
          <MapPinned className="size-4" /> {carregando ? "Gerando…" : "Gerar mapa"}
        </Button>
        {pontos && pontos.length > 0 && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        )}
      </div>
      {pontos && (
        <>
          {pontos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma visita com localização no período.</p>
          ) : (
            <>
              <Suspense fallback={<p className="text-xs text-muted-foreground">Carregando mapa…</p>}>
                <MapaRotaVisitas pontos={pontos} supervisorNome={supervisor} supervisorFotoUrl={fotoUrl} />
              </Suspense>
              <p className="text-xs text-muted-foreground">
                Verde = primeira visita · Vermelho = última · Linha tracejada = trajeto na ordem das visitas.
              </p>
              <ol className="grid gap-1 text-xs sm:grid-cols-2">
                {pontos.map((p) => (
                  <li key={p.ordem}>
                    <b>{p.ordem}.</b> {p.posto} — <span className="text-muted-foreground">{p.data}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {semLocal.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sem localização cadastrada (fora do mapa): {semLocal.join(", ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
