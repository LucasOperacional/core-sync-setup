import { useQuery } from "@tanstack/react-query";
import { CalendarX2, Loader2, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { minhasFaltasLancadas } from "@/lib/faltas-lancamentos.functions";
import { nomeAmigavel } from "@/lib/areas-gerentes";

export function MinhasFaltasSupervisorCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["minhas-faltas-lancadas"],
    queryFn: () => minhasFaltasLancadas(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando suas faltas...
        </CardContent>
      </Card>
    );
  }

  if (!data?.ehGerente) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
            <CalendarX2 className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">
              Minhas faltas lançadas — {nomeAmigavel(data.gerenteNome ?? "")}
            </CardTitle>
            <CardDescription className="text-xs">
              Faltas registradas no seu nome e os postos vinculados a você na NEXTI.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Registros lançados</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.totalRegistros}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Total de faltas</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.totalFaltas}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Postos vinculados</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.postos.length}</p>
          </div>
        </div>

        {data.postos.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Meus postos
            </p>
            <div className="flex flex-wrap gap-2">
              {data.postos.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-foreground"
                >
                  <MapPin className="size-3 text-primary" />
                  {p.nome}
                  {p.localidade ? ` — ${p.localidade}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.registros.length > 0 ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Colaborador</th>
                  <th className="px-3 py-2 font-semibold">Posto</th>
                  <th className="px-3 py-2 font-semibold">Cargo</th>
                  <th className="px-3 py-2 font-semibold">Tipo</th>
                  <th className="px-3 py-2 font-semibold">Período</th>
                  <th className="px-3 py-2 font-semibold">Faltas</th>
                </tr>
              </thead>
              <tbody>
                {data.registros.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 text-foreground">
                      {r.posto.toUpperCase().startsWith("RESERVA")
                        ? nomeAmigavel(data.gerenteNome ?? "")
                        : r.colaborador || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.posto || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.cargo || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.tipo || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.periodo || "—"}</td>
                    <td className="px-3 py-2 font-semibold text-foreground">{r.faltas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma falta lançada no seu nome até o momento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
