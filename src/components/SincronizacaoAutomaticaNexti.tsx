import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { syncNexti, type NextiModulo } from "@/lib/nexti-sync.functions";
import {
  invalidarConsultasProtocoloFolhas,
  notificarAtualizacaoProtocoloFolhas,
  protocoloFolhasQueryKeys,
} from "@/lib/protocolo-folhas-sync";

/** Intervalo fixo pedido na página de folhas: 2 minutos. */
const INTERVALO_MS = 2 * 60 * 1000;
const CHAVE_PREFERENCIA = "protocolo-folhas:auto-sync-nexti";
/** Módulos que descrevem os colaboradores (pessoas + dados de lotação). */
const MODULOS: NextiModulo[] = ["companies", "workplaces", "careers", "persons"];

function horaCurta(valor: number | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SincronizacaoAutomaticaNexti() {
  const queryClient = useQueryClient();
  const [ativo, setAtivo] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [ultima, setUltima] = useState<number | null>(null);
  const [registros, setRegistros] = useState<number | null>(null);
  const [pessoasPostos, setPessoasPostos] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const emExecucao = useRef(false);

  useEffect(() => {
    try {
      setAtivo(localStorage.getItem(CHAVE_PREFERENCIA) === "1");
    } catch {
      /* preferência indisponível */
    }
  }, []);

  const sincronizar = useCallback(
    async (manual: boolean) => {
      if (emExecucao.current) return;
      emExecucao.current = true;
      setRodando(true);
      try {
        const resultado = await syncNexti({
          data: { modulos: MODULOS, modo: manual ? "manual" : "automatico" },
        });
        setUltima(Date.now());
        setRegistros(resultado.totalRegistros);
        setErro(resultado.ok ? null : (resultado.erro ?? "Falha parcial na sincronização."));
        invalidarConsultasProtocoloFolhas(queryClient);
        // Recarrega na hora as contagens dos cards de posto, para que a
        // quantidade de pessoas por posto reflita exatamente o que veio da NEXTI.
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: protocoloFolhasQueryKeys.postosCards,
            type: "active",
          }),
          queryClient.refetchQueries({
            queryKey: protocoloFolhasQueryKeys.reservasNexti,
            type: "active",
          }),
          queryClient.refetchQueries({
            queryKey: protocoloFolhasQueryKeys.dashboardResumo,
            type: "active",
          }),
          queryClient.refetchQueries({
            queryKey: protocoloFolhasQueryKeys.funcionariosAtivos,
            type: "active",
          }),
        ]);
        const pessoas =
          queryClient.getQueryData<unknown[]>(protocoloFolhasQueryKeys.postosCards)?.length ?? null;
        setPessoasPostos(pessoas);
        notificarAtualizacaoProtocoloFolhas(manual ? "manual" : "atualizacao");
        if (manual) {
          toast.success(
            pessoas !== null
              ? `Colaboradores atualizados: ${pessoas} pessoas nos postos.`
              : `Colaboradores atualizados (${resultado.totalRegistros} registros).`,
          );
        }
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : String(e);
        setErro(mensagem);
        if (manual) toast.error(`Não foi possível sincronizar: ${mensagem}`);
      } finally {
        emExecucao.current = false;
        setRodando(false);
      }
    },
    [queryClient],
  );

  // A página abre primeiro; a sincronização automática com a NEXTI só
  // começa depois que a tela já está visível (regra global).
  const nextiPronto = useNextiDiferido();

  useEffect(() => {
    if (!ativo || !nextiPronto) return;
    void sincronizar(false);
    const id = window.setInterval(() => void sincronizar(false), INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [ativo, sincronizar]);

  function alternar(valor: boolean) {
    setAtivo(valor);
    try {
      localStorage.setItem(CHAVE_PREFERENCIA, valor ? "1" : "0");
    } catch {
      /* preferência indisponível */
    }
    toast.info(
      valor
        ? "Sincronização automática ligada: colaboradores atualizados a cada 2 minutos."
        : "Sincronização automática desligada.",
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Sincronizar colaboradores com a NEXTI
        </CardTitle>
        <div className="flex items-center gap-3">
          <Label htmlFor="auto-sync-nexti" className="text-xs text-muted-foreground">
            A cada 2 minutos
          </Label>
          <Switch id="auto-sync-nexti" checked={ativo} onCheckedChange={alternar} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ligada" : "Desligada"}</Badge>
        <span className="text-xs text-muted-foreground">
          Última atualização: {horaCurta(ultima)}
          {registros !== null ? ` · ${registros} registros` : ""}
          {pessoasPostos !== null ? ` · ${pessoasPostos} pessoas nos postos` : ""}
        </span>
        {erro ? <span className="text-xs text-destructive">{erro}</span> : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto gap-2"
          disabled={rodando}
          onClick={() => void sincronizar(true)}
        >
          <RefreshCw className={`h-4 w-4 ${rodando ? "animate-spin" : ""}`} />
          {rodando ? "Sincronizando..." : "Sincronizar agora"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default SincronizacaoAutomaticaNexti;
