import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Search, UserMinus, X } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listarDemitidosNexti } from "@/lib/nexti-demitidos.functions";

/** Converte a data recebida da NEXTI para o formato AAAA-MM-DD (comparavel). */
function dataIso(valor: string | null): string | null {
  if (!valor) return null;
  const direto = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direto) return `${direto[1]}-${direto[2]}-${direto[3]}`;
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatarData(valor: string | null): string {
  const iso = dataIso(valor);
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function semAcento(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * Card que lista os colaboradores em situacao DEMITIDO puxando os dados
 * direto da API da NEXTI, com filtro por periodo de demissao e busca por texto.
 */
export function DemitidosNextiCard() {
  // A página abre primeiro; a consulta à NEXTI só dispara depois (regra global).
  const nextiPronto = useNextiDiferido();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["nexti", "demitidos"],
    queryFn: () => listarDemitidosNexti(),
    staleTime: 60_000,
    enabled: nextiPronto,
  });

  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [busca, setBusca] = useState("");

  const demitidos = data?.demitidos ?? [];

  // Quantidade de demissoes por mes (chave AAAA-MM), independente dos filtros.
  const quantidadePorMes = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const d of demitidos) {
      const iso = dataIso(d.dataDemissao);
      if (!iso) continue;
      const chave = iso.slice(0, 7);
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    return contagem;
  }, [demitidos]);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return demitidos.filter((d) => {
      const iso = dataIso(d.dataDemissao);
      // Dia especifico tem prioridade; depois o mes; depois o intervalo.
      if (dia) {
        if (iso !== dia) return false;
      } else if (mes) {
        if (!iso || iso.slice(0, 7) !== mes) return false;
      } else {
        if (inicio && (!iso || iso < inicio)) return false;
        if (fim && (!iso || iso > fim)) return false;
      }
      if (termo) {
        const alvo = semAcento([d.nome, d.cargo, d.posto, d.matricula ?? "", d.situacao].join(" "));
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [demitidos, dia, mes, inicio, fim, busca]);

  const temFiltro = Boolean(dia || mes || inicio || fim || busca);

  function definirHoje() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    setDia(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }

  function rotuloMes(chave: string): string {
    const [ano, m] = chave.split("-");
    const nomes = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ];
    return `${nomes[Number(m) - 1] ?? m}/${ano}`;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserMinus className="h-4 w-4 text-destructive" />
            Demitidos
          </CardTitle>
          <CardDescription className="mt-1">
            Colaboradores em situação de demissão, buscados na API da NEXTI.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data?.ok ? (
            <Badge variant="secondary">
              {filtrados.length} de {data.total}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`size-4${isFetching ? " animate-spin" : ""}`} />
            {isFetching ? "Sincronizando..." : "Sincronizar com NEXTI"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="demitidos-dia" className="text-xs">
              Dia da demissão
            </Label>
            <Input
              id="demitidos-dia"
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="w-auto"
            />
          </div>
          <Button type="button" variant="secondary" onClick={definirHoje}>
            Hoje
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor="demitidos-mes" className="text-xs">
              Mês da demissão
            </Label>
            <Input
              id="demitidos-mes"
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              disabled={Boolean(dia)}
              className="w-auto"
            />
          </div>
          {dia ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <span className="text-2xl font-bold leading-none text-destructive">
                {filtrados.length}
              </span>
              <span className="text-xs text-muted-foreground">
                demissões neste dia
                <br />
                {rotuloMes(dia.slice(0, 7))}
              </span>
            </div>
          ) : mes ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <span className="text-2xl font-bold leading-none text-destructive">
                {quantidadePorMes.get(mes) ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                demissões no mês
                <br />
                {rotuloMes(mes)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="demitidos-inicio" className="text-xs">
              Demissão de
            </Label>
            <Input
              id="demitidos-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              disabled={Boolean(dia || mes)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demitidos-fim" className="text-xs">
              Demissão até
            </Label>
            <Input
              id="demitidos-fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              disabled={Boolean(dia || mes)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="demitidos-busca" className="text-xs">
              Buscar
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="demitidos-busca"
                  className="pl-8"
                  placeholder="Nome, cargo, posto ou matrícula"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              {temFiltro ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDia("");
                    setMes("");
                    setInicio("");
                    setFim("");
                    setBusca("");
                  }}
                >
                  <X className="size-4" />
                  Limpar
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Consultando a NEXTI...
          </div>
        ) : isError || !data?.ok ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {data?.erro ??
                (error instanceof Error
                  ? error.message
                  : "Não foi possível carregar os demitidos da NEXTI.")}
            </span>
          </div>
        ) : filtrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {demitidos.length === 0
              ? "Nenhum colaborador em situação de demissão encontrado na NEXTI."
              : "Nenhum demitido para os filtros escolhidos."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Nome</th>
                  <th className="py-2 pr-4 font-medium">Matrícula</th>
                  <th className="py-2 pr-4 font-medium">Cargo</th>
                  <th className="py-2 pr-4 font-medium">Posto</th>
                  <th className="py-2 pr-4 font-medium">Situação</th>
                  <th className="py-2 pr-4 font-medium">Demissão</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-medium text-foreground">{d.nome}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{d.matricula || "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{d.cargo || "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{d.posto || "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{d.situacao || "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {formatarData(d.dataDemissao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
