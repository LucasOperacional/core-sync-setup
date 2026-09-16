import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Smartphone, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { consultarPermiteMobile, definirPermiteMobile } from "@/lib/permite-mobile.functions";

export const PERMITE_MOBILE_QUERY_KEY = ["ferias", "permite-mobile"] as const;

type Props = { nomes: string[] };

export default function FeriasPermiteMobileCard({ nomes }: Props) {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState("");

  const lista = Array.from(new Set(nomes.map((n) => n.trim()).filter(Boolean)));

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [...PERMITE_MOBILE_QUERY_KEY, lista],
    queryFn: () => consultarPermiteMobile({ data: { nomes: lista } }),
    enabled: lista.length > 0,
    staleTime: 60_000,
  });

  const desativar = useMutation({
    mutationFn: (personId: number) => definirPermiteMobile({ data: { personId, permitir: false } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Permite marcação mobile desligada na NEXTI.");
        queryClient.invalidateQueries({ queryKey: PERMITE_MOBILE_QUERY_KEY });
      } else {
        toast.error(res.erro || "Não foi possível desativar.");
      }
    },
    onError: () => toast.error("Não foi possível desativar."),
  });

  const pessoas = (data?.pessoas ?? []).filter((p) =>
    filtro.trim() ? p.nome.toLowerCase().includes(filtro.trim().toLowerCase()) : true,
  );
  const ativos = (data?.pessoas ?? []).filter((p) => p.permiteMobile === true).length;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-primary" />
            Flag Permite marcação mobile
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{data?.pessoas.length ?? 0} colaborador(es)</Badge>
            <Badge variant={ativos > 0 ? "default" : "outline"}>
              {ativos} com marcação mobile ligada
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching || lista.length === 0}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Flag puxada direto do cadastro da NEXTI. Ao enviar as AUSÊNCIAS (Férias) para
          lançamento, a "Permite marcação mobile" é desligada automaticamente para cada
          colaborador lançado.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Importe a planilha de férias para carregar os colaboradores e suas flags.
          </p>
        ) : (
          <>
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por nome"
              className="h-9"
            />
            <ScrollArea className="max-h-72">
              <div className="space-y-2 pr-2">
                {isLoading && (
                  <p className="text-sm text-muted-foreground">Consultando a NEXTI...</p>
                )}
                {!isLoading && pessoas.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum colaborador encontrado.</p>
                )}
                {pessoas.map((p) => (
                  <div
                    key={`${p.nome}-${p.personId ?? "sem-id"}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{p.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.matricula ? `Matrícula ${p.matricula}` : "Sem matrícula"}
                        {p.erro ? ` · ${p.erro}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          p.permiteMobile === null
                            ? "outline"
                            : p.permiteMobile
                              ? "default"
                              : "secondary"
                        }
                      >
                        {p.permiteMobile === null
                          ? "Não lido"
                          : p.permiteMobile
                            ? "Marcação mobile ligada"
                            : "Marcação mobile desligada"}
                      </Badge>
                      {p.permiteMobile === true && p.personId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => desativar.mutate(p.personId!)}
                          disabled={desativar.isPending}
                        >
                          <ShieldOff className="mr-1 h-3.5 w-3.5" />
                          Desativar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
