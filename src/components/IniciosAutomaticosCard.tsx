import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listarIniciosAutomaticos,
  type InicioAutomatico,
} from "@/lib/inicios-automaticos.functions";

const ORIGEM_LABEL: Record<InicioAutomatico["origem"], string> = {
  chegada: "Chegada à porta do posto",
  geofence: "Permanência dentro do posto",
};

function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Histórico de inícios automáticos do cronômetro, para conferir as visitas. */
export function IniciosAutomaticosCard() {
  const listar = useServerFn(listarIniciosAutomaticos);
  const [aberto, setAberto] = useState(false);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["inicios-automaticos-visita"],
    queryFn: () => listar(),
    enabled: aberto,
  });

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <History className="size-5 text-primary" />
          <div>
            <h2 className="text-base font-bold">Inícios automáticos do cronômetro</h2>
            <p className="text-xs text-muted-foreground">
              Horário e localização confirmada de cada início automático, para conferir as visitas.
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {aberto && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setAberto((v) => !v)}>
            {aberto ? "Fechar" : "Abrir"}
          </Button>
        </div>
      </header>

      {aberto && (
        <div className="overflow-x-auto px-5 py-4">
          {isFetching && !data ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : !data || data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum início automático registrado ainda.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-semibold">Data e hora</th>
                  <th className="pb-2 pr-4 font-semibold">Supervisor</th>
                  <th className="pb-2 pr-4 font-semibold">Posto</th>
                  <th className="pb-2 pr-4 font-semibold">Como iniciou</th>
                  <th className="pb-2 font-semibold">Localização confirmada</th>
                </tr>
              </thead>
              <tbody>
                {data.map((i) => (
                  <tr key={i.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4 whitespace-nowrap">{dataHoraBr(i.criadoEm)}</td>
                    <td className="py-2.5 pr-4">{i.supervisorNome || "—"}</td>
                    <td className="py-2.5 pr-4">{i.postoNome || "—"}</td>
                    <td className="py-2.5 pr-4">{ORIGEM_LABEL[i.origem]}</td>
                    <td className="py-2.5">
                      {i.latitude !== null && i.longitude !== null ? (
                        <a
                          href={`https://www.google.com/maps?q=${i.latitude},${i.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <MapPin className="size-3.5" />
                          Ver no mapa
                          {i.precisaoMetros !== null && (
                            <span className="text-xs text-muted-foreground">
                              (±{Math.round(i.precisaoMetros)} m)
                            </span>
                          )}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Sem sinal de GPS no momento</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
