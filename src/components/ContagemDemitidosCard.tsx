import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, UserMinus } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listarDemitidosNexti } from "@/lib/nexti-demitidos.functions";

/**
 * Card compacto que mostra apenas a contagem total de colaboradores em
 * situacao de demissao, buscados na API da NEXTI.
 */
export function ContagemDemitidosCard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["nexti", "demitidos"],
    queryFn: () => listarDemitidosNexti(),
    staleTime: 60_000,
  });

  const total = data?.total ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <UserMinus className="size-5" />
          </span>
          <div className="flex-1">
            <CardTitle className="text-base">Demitidos</CardTitle>
            <CardDescription className="mt-1">
              Total de colaboradores em situação de demissão, buscados na API da NEXTI.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Consultando a NEXTI...
          </div>
        ) : isError || !data?.ok ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {data?.erro ??
                (error instanceof Error
                  ? error.message
                  : "Não foi possível carregar os demitidos da NEXTI.")}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold leading-none tabular-nums text-destructive">
              {total.toLocaleString("pt-BR")}
            </p>
            <span className="text-sm text-muted-foreground">
              {total === 1 ? "colaborador demitido" : "colaboradores demitidos"}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
