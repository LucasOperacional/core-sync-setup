import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsAdmin, useSessao } from "@/hooks/use-sessao";
import {
  verificarRastreioPerto,
  type ResultadoRastreioLembrete,
} from "@/lib/rastreio-lembrete.functions";

/**
 * Visão administrativa do rastreio perto dos postos da NEXTI.
 * Para supervisores o lembrete é enviado sozinho, sem card e sem botões.
 */
export function RastreioPertoPostoCard() {
  const { user } = useSessao();
  const { data: souAdmin } = useIsAdmin(user);
  const verificar = useServerFn(verificarRastreioPerto);
  const [dados, setDados] = useState<ResultadoRastreioLembrete | null>(null);

  const rodar = useMutation({
    mutationFn: async () =>
      verificar({ data: { escopo: "todos", enviar: true, latitude: null, longitude: null } }),
    onSuccess: (r) => {
      setDados(r);
      const enviados = r.lembretes.filter((l) => l.enviado).length;
      const perto = r.lembretes.filter((l) => l.posto).length;
      toast.success(
        enviados > 0
          ? `${enviados} lembrete(s) enviado(s) • ${perto} pessoa(s) em posto`
          : perto > 0
            ? `${perto} pessoa(s) em posto, nenhum lembrete novo necessário`
            : "Ninguém perto de um posto da NEXTI agora",
      );
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível conferir o rastreio."),
  });

  if (!souAdmin) return null;

  const ocupado = rodar.isPending;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4 text-primary" />
          Rastreio perto dos postos
        </CardTitle>
        <CardDescription>
          Os endereços e nomes dos postos vêm da API da NEXTI. Quem está a até 300 m de um posto e
          ainda não enviou o Relatório de Supervisão de Campo do dia recebe o lembrete no celular
          automaticamente, sem precisar clicar em nada.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button type="button" size="sm" onClick={() => rodar.mutate()} disabled={ocupado}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
          Conferir todos agora
        </Button>

        {dados && (
          <>
            <p className="text-xs text-muted-foreground">
              {dados.postosConsultados} posto(s) da NEXTI com localização • {dados.lembretes.length}{" "}
              pessoa(s) analisada(s)
            </p>

            <div className="space-y-2">
              {dados.lembretes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma posição recente do rastreio para analisar.
                </p>
              )}
              {dados.lembretes.map((l) => (
                <div
                  key={l.userId}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <span className="font-semibold text-foreground">{l.nome}</span>
                  {l.posto ? (
                    <span className="text-muted-foreground">
                      {l.posto}
                      {l.cidade ? ` • ${l.cidade}` : ""} • {l.distanciaMetros} m
                      {l.minutosAtras !== null ? ` • há ${l.minutosAtras} min` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{l.motivo}</span>
                  )}
                  {l.posto && (
                    <Badge
                      variant={
                        l.enviado ? "default" : l.relatorioHoje ? "secondary" : "destructive"
                      }
                    >
                      {l.enviado
                        ? "Lembrete enviado"
                        : l.relatorioHoje
                          ? "Relatório de hoje feito"
                          : l.motivo || "Relatório pendente"}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
