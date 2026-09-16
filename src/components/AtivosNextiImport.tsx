import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudDownload, Loader2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EMPRESAS_PERMITIDAS, importarAtivosDaNexti } from "@/lib/nexti-ativos.functions";

import { sincronizarDashboardProtocoloFolhas } from "@/lib/protocolo-folhas-sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

type LinhaAtivo = {
  nome: string;
  cargo: string | null;
  empresa: string | null;
  posto: string | null;
};

/** Lista os funcionários ativos com as colunas COLABORADOR, CARGO, EMPRESA e POSTO. */
function useAtivosComPosto() {
  return useQuery({
    queryKey: ["funcionarios-ativos-posto"],
    queryFn: async () => {
      const PAGINA = 1000;
      const todos: LinhaAtivo[] = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await supabase
          .from("funcionarios_ativos")
          .select("nome, cargo, empresa, posto")
          .order("empresa", { ascending: true })
          .order("nome", { ascending: true })
          .range(inicio, inicio + PAGINA - 1);
        if (error) throw error;
        const lote = (data ?? []) as LinhaAtivo[];
        todos.push(...lote);
        if (lote.length < PAGINA) break;
      }
      return todos;
    },
  });
}

const CHAVE_AUTO = "ativos-nexti-auto-sync";
const CHAVE_AUTO_ATIVA = "ativos-nexti-auto-sync-ativa";
const INTERVALO_AUTO = 5 * 60 * 1000;

export function AtivosNextiImport() {
  const queryClient = useQueryClient();
  const importar = useServerFn(importarAtivosDaNexti);
  const { data: linhas, isLoading } = useAtivosComPosto();
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState("");
  const [autoAtiva, setAutoAtiva] = useState(true);
  const [ultimaSync, setUltimaSync] = useState<number | null>(null);

  // Lê a preferência salva de sincronização automática.
  useEffect(() => {
    setAutoAtiva(localStorage.getItem(CHAVE_AUTO_ATIVA) !== "0");
    const ultima = Number(localStorage.getItem(CHAVE_AUTO) ?? 0) || 0;
    setUltimaSync(ultima || null);
  }, []);

  const sincronizar = useCallback(
    async (silencioso = false) => {
      setImportando(true);
      try {
        const res = await importar({});
        if (!res.ok) {
          if (!silencioso) toast.error(res.erro ?? "Não foi possível importar da NEXTI.");
          return;
        }
        if (!silencioso) {
          toast.success(
            `${res.total.toLocaleString("pt-BR")} colaboradores em situação TRABALHANDO importados das empresas autorizadas.`,
          );
        }
        localStorage.setItem(CHAVE_AUTO, String(Date.now()));
        setUltimaSync(Date.now());
        for (const key of [["funcionarios-ativos-posto"], ["dashboard-total-ativos"]]) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        // Atualiza dashboard, status de protocolação e demais abas na hora (e para os outros usuários).
        await sincronizarDashboardProtocoloFolhas(queryClient);
      } catch (err) {
        if (!silencioso) {
          toast.error(err instanceof Error ? err.message : "Falha ao importar da NEXTI.");
        }
      } finally {
        setImportando(false);
      }
    },
    [importar, queryClient],
  );

  // Sincronização automática com a API da NEXTI: ao abrir a aba e a cada 5 minutos.
  useEffect(() => {
    if (!autoAtiva) return;
    const rodar = () => {
      const ultima = Number(localStorage.getItem(CHAVE_AUTO) ?? 0) || 0;
      if (Date.now() - ultima < INTERVALO_AUTO) return;
      void sincronizar(true);
    };
    rodar();
    const timer = setInterval(rodar, 60 * 1000);
    return () => clearInterval(timer);
  }, [sincronizar, autoAtiva]);

  const alternarAuto = useCallback(
    (valor: boolean) => {
      setAutoAtiva(valor);
      localStorage.setItem(CHAVE_AUTO_ATIVA, valor ? "1" : "0");
      if (valor) void sincronizar(true);
    },
    [sincronizar],
  );

  const termo = busca.trim().toLowerCase();
  const filtradas = (linhas ?? []).filter((l) =>
    termo
      ? [l.nome, l.cargo, l.empresa, l.posto].some((v) => (v ?? "").toLowerCase().includes(termo))
      : true,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-lg">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Colaboradores da NEXTI
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <Switch checked={autoAtiva} onCheckedChange={alternarAuto} />
              Sincronizar automaticamente
            </label>
            <Button
              variant="outline"
              onClick={() => void sincronizar()}
              disabled={importando}
              className="gap-2"
            >
              {importando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="h-4 w-4" />
              )}
              {importando ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          {autoAtiva
            ? "A lista é atualizada sozinha ao abrir a aba e a cada 5 minutos, sem precisar apertar nenhum botão. "
            : "A atualização automática está desligada; use o botão acima para atualizar. "}
          Traz somente os colaboradores em situação <Badge variant="secondary">TRABALHANDO</Badge>{" "}
          das empresas autorizadas, gravando apenas colaborador, cargo, empresa e posto.
        </div>
        {ultimaSync && (
          <p className="text-xs text-muted-foreground">
            Última sincronização:{" "}
            {new Date(ultimaSync).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {EMPRESAS_PERMITIDAS.map((e) => (
            <Badge key={e} variant="outline" className="text-[11px]">
              {e}
            </Badge>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por colaborador, cargo, empresa ou posto"
            className="pl-9"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Carregando lista..."
            : `${filtradas.length.toLocaleString("pt-BR")} de ${(linhas?.length ?? 0).toLocaleString("pt-BR")} colaboradores`}
        </p>

        <ScrollArea className="h-[420px] rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">COLABORADOR</th>
                <th className="px-3 py-2 font-semibold">CARGO</th>
                <th className="px-3 py-2 font-semibold">EMPRESA</th>
                <th className="px-3 py-2 font-semibold">POSTO</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l, i) => (
                <tr key={`${l.nome}-${i}`} className="border-t border-border/60">
                  <td className="px-3 py-2">{l.nome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.cargo || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.empresa || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.posto || "—"}</td>
                </tr>
              ))}
              {!isLoading && filtradas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum colaborador na lista. Use o botão acima para importar da NEXTI.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
