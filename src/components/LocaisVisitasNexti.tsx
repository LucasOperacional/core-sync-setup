/**
 * LOCAIS DE VISITAS (NEXTI Control 2.0) por Gerente de Área.
 *
 * Monta a lista de locais a partir dos relatórios importados
 * (`nexti_checklist_answers`), do vínculo checklist -> postos
 * (`nexti_checklists.workplace_ids`) e do cadastro de postos
 * (`nexti_workplaces`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ehGerenteAreaA, gerenteAreaACanonico } from "@/lib/gerentes-area-a";

type Local = {
  id: number;
  nome: string;
  cliente: string;
  cidade: string;
  uf: string;
  /** Relatórios em que a NEXTI confirmou este local. */
  relatorios: number;
  /** true quando o local vem do vínculo do checklist (posto habilitado). */
  habilitado: boolean;
};

type GrupoGerente = {
  gerente: string;
  relatorios: number;
  locais: Local[];
};

export function LocaisVisitasNexti() {
  const [grupos, setGrupos] = useState<GrupoGerente[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [respostas, checklists, postos] = await Promise.all([
        supabase
          .from("nexti_checklist_answers")
          .select("checklist_id,supervisor_nome,workplace_id,answer_date")
          .order("answer_date", { ascending: false })
          .limit(5000),
        supabase.from("nexti_checklists").select("nexti_id,workplace_ids").limit(2000),
        supabase
          .from("nexti_workplaces")
          .select("nexti_id,name,client_name,city,state")
          .limit(5000),
      ]);

      const postosPorChecklist = new Map<number, number[]>();
      for (const c of checklists.data ?? []) {
        postosPorChecklist.set(
          Number(c.nexti_id),
          ((c.workplace_ids ?? []) as number[]).map(Number),
        );
      }
      const mapaPostos = new Map((postos.data ?? []).map((p) => [Number(p.nexti_id), p] as const));

      const porGerente = new Map<
        string,
        { relatorios: number; confirmados: Map<number, number>; habilitados: Set<number> }
      >();
      for (const r of respostas.data ?? []) {
        const nome = (r.supervisor_nome ?? "").trim();
        if (!nome || !ehGerenteAreaA(nome)) continue;
        const gerente = gerenteAreaACanonico(nome) ?? nome;
        const atual = porGerente.get(gerente) ?? {
          relatorios: 0,
          confirmados: new Map<number, number>(),
          habilitados: new Set<number>(),
        };
        atual.relatorios += 1;
        const postosDoChecklist = postosPorChecklist.get(Number(r.checklist_id)) ?? [];
        const direto = Number(r.workplace_id);
        // Local exato: vem na resposta ou o checklist vale para um único posto.
        const exato =
          Number.isFinite(direto) && direto > 0
            ? direto
            : postosDoChecklist.length === 1
              ? Number(postosDoChecklist[0])
              : 0;
        if (exato > 0) {
          atual.confirmados.set(exato, (atual.confirmados.get(exato) ?? 0) + 1);
        }
        for (const wid of postosDoChecklist) atual.habilitados.add(Number(wid));
        porGerente.set(gerente, atual);
      }

      const lista: GrupoGerente[] = [...porGerente.entries()]
        .map(([gerente, v]) => ({
          gerente,
          relatorios: v.relatorios,
          locais: [...new Set([...v.confirmados.keys(), ...v.habilitados])]
            .map((id) => {
              const p = mapaPostos.get(id);
              return {
                id,
                nome: (p?.name ?? `Posto ${id}`).trim(),
                cliente: (p?.client_name ?? "").trim(),
                cidade: (p?.city ?? "").trim(),
                uf: (p?.state ?? "").trim(),
                relatorios: v.confirmados.get(id) ?? 0,
                habilitado: !v.confirmados.has(id),
              };
            })
            .sort((a, b) => b.relatorios - a.relatorios || a.nome.localeCompare(b.nome)),
        }))
        .sort((a, b) => b.locais.length - a.locais.length);

      setGrupos(lista);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const canal = supabase
      .channel("control-locais-visitas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nexti_checklist_answers" },
        () => void carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nexti_checklists" },
        () => void carregar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (!termo) return grupos;
    return grupos
      .map((g) => ({
        ...g,
        locais: g.locais.filter((l) =>
          `${l.nome} ${l.cliente} ${l.cidade} ${l.uf}`.toUpperCase().includes(termo),
        ),
      }))
      .filter((g) => g.gerente.toUpperCase().includes(termo) || g.locais.length > 0);
  }, [grupos, busca]);

  const totalLocais = useMemo(
    () => new Set(grupos.flatMap((g) => g.locais.map((l) => l.id))).size,
    [grupos],
  );

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Locais de visitas por Gerente de Área</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar local, cliente ou cidade"
              className="w-64 rounded-lg border border-border bg-secondary py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <RefreshCw className={`size-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {grupos.length} gerente(s) de área · {totalLocais} local(is) de visita vindos do NEXTI
        Control 2.0. Locais marcados como “Posto do checklist” são os postos habilitados para o
        checklist respondido — a NEXTI não informa o posto exato nesses relatórios.
      </p>

      {filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum local de visita importado ainda. Use o botão “Locais de visitas (NEXTI)”.
        </p>
      ) : (
        <div className="space-y-4">
          {filtrados.map((g) => (
            <div key={g.gerente} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                <span className="text-sm font-semibold">{g.gerente}</span>
                <span className="text-xs text-muted-foreground">
                  {g.locais.length} local(is) · {g.relatorios} relatório(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Local de visita</th>
                      <th className="px-4 py-2">Cliente</th>
                      <th className="px-4 py-2">Cidade/UF</th>
                      <th className="px-4 py-2">Origem</th>
                      <th className="px-4 py-2 text-right">Relatórios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.locais.map((l) => (
                      <tr key={l.id} className="border-t border-border/60">
                        <td className="px-4 py-2 font-medium">{l.nome}</td>
                        <td className="px-4 py-2 text-muted-foreground">{l.cliente || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {[l.cidade, l.uf].filter(Boolean).join("/") || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {l.habilitado ? "Posto do checklist" : "Confirmado pela NEXTI"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {l.relatorios > 0 ? l.relatorios : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
