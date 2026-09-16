/**
 * Sincroniza todos os colaboradores da NEXTI para conferir quem está
 * com o cadastro ativo e quem está inativo.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  sincronizarColaboradoresNexti,
  type ColaboradorSincronizado,
} from "@/lib/nexti-flags.functions";

type Filtro = "todos" | "ativos" | "inativos";

export function SincronizarColaboradoresNexti() {
  const [carregando, setCarregando] = useState(false);
  const [colaboradores, setColaboradores] = useState<ColaboradorSincronizado[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const sincronizar = useServerFn(sincronizarColaboradoresNexti);

  const ativos = colaboradores?.filter((c) => c.ativo).length ?? 0;
  const inativos = (colaboradores?.length ?? 0) - ativos;

  const lista = useMemo(() => {
    if (!colaboradores) return [];
    const termo = busca.trim().toLowerCase();
    return colaboradores.filter((c) => {
      if (filtro === "ativos" && !c.ativo) return false;
      if (filtro === "inativos" && c.ativo) return false;
      if (!termo) return true;
      return (
        c.nome.toLowerCase().includes(termo) ||
        c.cpf.includes(termo.replace(/\D/g, "")) ||
        c.matricula.toLowerCase().includes(termo) ||
        c.posto.toLowerCase().includes(termo)
      );
    });
  }, [colaboradores, filtro, busca]);

  async function executar() {
    setCarregando(true);
    try {
      const r = await sincronizar();
      setColaboradores(r.colaboradores);
      if (r.erro) toast.warning(`Sincronização parcial: ${r.erro}`);
      else
        toast.success(
          `${r.total} colaboradores sincronizados — ${r.ativos} ativos e ${r.inativos} inativos.`,
        );
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível sincronizar com a NEXTI.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Sincronizar colaboradores da NEXTI
        </CardTitle>
        <CardDescription>
          Busca todos os cadastros na NEXTI e mostra quais estão ativos e quais estão inativos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void executar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
          {colaboradores && (
            <>
              <Badge variant="secondary">{colaboradores.length} colaboradores</Badge>
              <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                {ativos} ativos
              </Badge>
              <Badge variant="outline" className="border-destructive text-destructive">
                {inativos} inativos
              </Badge>
            </>
          )}
        </div>

        {colaboradores && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar por nome, CPF, matrícula ou posto"
                aria-label="Filtrar colaboradores sincronizados"
              />
              <div className="flex gap-1">
                {(["todos", "ativos", "inativos"] as Filtro[]).map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={filtro === f ? "default" : "outline"}
                    onClick={() => setFiltro(f)}
                  >
                    {f === "todos" ? "Todos" : f === "ativos" ? "Ativos" : "Inativos"}
                  </Button>
                ))}
              </div>
            </div>

            <div className="max-h-96 overflow-auto rounded-md border">
              {lista.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Nenhum colaborador para este filtro.
                </p>
              ) : (
                <ul className="divide-y">
                  {lista.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Matrícula {c.matricula || "—"} · CPF {c.cpf || "—"} ·{" "}
                          {c.posto || "sem posto"}
                        </p>
                      </div>
                      <Badge variant={c.ativo ? "secondary" : "destructive"}>{c.situacao}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SincronizarColaboradoresNexti;
