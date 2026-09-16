import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Users,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  EyeOff,
  Gavel,
  Baby,
  RefreshCw,
  Database,
  Loader2,
  Moon,
  DoorOpen,
  Briefcase,
  UserCog,
  SprayCan,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  contarFolhasUnicas,
  normalizarTextoProtocolo,
  obterUltimaSincronizacaoProtocolo,
  protocoloFolhasQueryKeys,
  registrarFalhaSincronizacaoProtocolo,
  sincronizarDashboardProtocoloFolhas,
  type FolhaParaChave,
  type SincronizacaoTempoReal,
  type StatusTempoRealProtocolo,
} from "@/lib/protocolo-folhas-sync";
import { useCategoriasPostos } from "@/lib/postos-cards";

type FolhaProtocolada = FolhaParaChave & {
  id: string;
  protocolo_id: string;
  colaborador: string;
  empresa: string;
  cargo: string;
  matricula: string;
  posto: string | null;
  ordem: number;
};

type FuncionarioAtivoBanco = FolhaParaChave & {
  id: string;
  nome: string;
  empresa: string;
  cargo: string;
  matricula: string;
  posto: string | null;
};

type ResumoDashboardProtocolo = {
  ativos: FuncionarioAtivoBanco[];
  folhas: FolhaProtocolada[];
  sincronizadoEm: string;
};

async function buscarTodosPaginado<T>(
  consulta: (inicio: number, fim: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000;
  const todos: T[] = [];

  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await consulta(inicio, inicio + PAGINA - 1);
    if (error) throw error;

    const lote = data ?? [];
    todos.push(...lote);
    if (lote.length < PAGINA) break;
  }

  return todos;
}

async function carregarResumoDashboardProtocolo(): Promise<ResumoDashboardProtocolo> {
  try {
    const [ativos, folhas] = await Promise.all([
      buscarTodosPaginado<FuncionarioAtivoBanco>(async (inicio, fim) => {
        const { data, error } = await supabase
          .from("funcionarios_ativos")
          .select("id, nome, empresa, cargo, matricula, posto")
          .eq("ativo", true)
          .order("empresa", { ascending: true })
          .order("nome", { ascending: true })
          .range(inicio, fim);
        return { data: (data ?? []) as FuncionarioAtivoBanco[], error };
      }),
      buscarTodosPaginado<FolhaProtocolada>(async (inicio, fim) => {
        const { data, error } = await supabase
          .from("protocolo_folhas")
          .select("id, protocolo_id, colaborador, empresa, cargo, matricula, posto, ordem")
          .order("id", { ascending: true })
          .range(inicio, fim);
        return { data: (data ?? []) as FolhaProtocolada[], error };
      }),
    ]);

    return {
      ativos,
      folhas,
      sincronizadoEm: new Date().toISOString(),
    };
  } catch (erro) {
    registrarFalhaSincronizacaoProtocolo("dashboard-query", erro);
    throw erro;
  }
}

function useResumoDashboardProtocolo() {
  return useQuery({
    queryKey: protocoloFolhasQueryKeys.dashboardResumo,
    queryFn: carregarResumoDashboardProtocolo,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });
}

function CardKpi({
  titulo,
  valor,
  icone,
  corBorda,
  corFundo,
  corValor,
  carregando,
  legenda,
  nomes,
}: {
  titulo: string;
  valor: number;
  icone: React.ReactNode;
  corBorda: string;
  corFundo: string;
  corValor: string;
  carregando?: boolean;
  legenda?: string;
  nomes?: { nome: string; empresa: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const temNomes = !carregando && nomes;
  const nomesExistentes = temNomes && nomes!.length > 0;

  function alternar() {
    if (nomesExistentes) setAberto((prev) => !prev);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (nomesExistentes && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setAberto((prev) => !prev);
    }
  }

  return (
    <div
      role={nomesExistentes ? "button" : undefined}
      tabIndex={nomesExistentes ? 0 : -1}
      onClick={alternar}
      onKeyDown={handleKeyDown}
      className={`group relative overflow-hidden rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${corBorda} ${corFundo} ${nomesExistentes ? "cursor-pointer" : ""}`}
      aria-label={
        nomesExistentes
          ? `${titulo}: clique para ${aberto ? "ocultar" : "ver"} os nomes`
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </span>
        <span
          className={`shrink-0 opacity-70 transition-opacity group-hover:opacity-100 ${corValor}`}
        >
          {icone}
        </span>
      </div>
      {carregando ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className={`mt-2 text-3xl font-bold leading-none tabular-nums ${corValor}`}>
          {valor.toLocaleString("pt-BR")}
        </p>
      )}
      {legenda && !carregando && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{legenda}</p>
      )}
      {temNomes && (
        <div className="mt-2">
          {nomesExistentes ? (
            aberto ? (
              <>
                <ul className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {nomes!.map((pessoa) => (
                    <li
                      key={`${pessoa.empresa}|${pessoa.nome}`}
                      className="truncate text-[11px] font-medium text-foreground"
                      title={`${pessoa.nome}${pessoa.empresa ? ` — ${pessoa.empresa}` : ""}`}
                    >
                      {pessoa.nome}
                      {pessoa.empresa ? (
                        <span className="text-muted-foreground"> · {pessoa.empresa}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">Clique para ocultar</p>
              </>
            ) : (
              <p className={`text-[11px] font-medium ${corValor}`}>Clique para ver os nomes</p>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground">Nenhum colaborador neste posto</p>
          )}
        </div>
      )}
    </div>
  );
}

type CategoriaPosto = "inss" | "desaparecidos" | "maternidade" | "audiencia";

/** Classifica o posto informado em uma das categorias acompanhadas nos cards. */
function categoriaDoPosto(posto: string | null | undefined): CategoriaPosto | null {
  const p = normalizarTextoProtocolo(posto);
  if (!p) return null;
  if (p.includes("INSS")) return "inss";
  if (p.startsWith("DESAPARECID")) return "desaparecidos";
  if (p.includes("MATERNIDADE")) return "maternidade";
  if (p.includes("AUDIENCIA")) return "audiencia";
  return null;
}

function formatarDataHora(valor: string | null | undefined): string {
  if (!valor) return "Ainda não sincronizado";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Ainda não sincronizado";
  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

const ESTADOS_TEMPO_REAL: Record<
  StatusTempoRealProtocolo,
  { rotulo: string; classe: string; ponto: string }
> = {
  conectado: {
    rotulo: "Tempo real ativo",
    classe: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    ponto: "bg-emerald-500 animate-pulse",
  },
  conectando: {
    rotulo: "Conectando",
    classe: "bg-muted text-muted-foreground",
    ponto: "bg-muted-foreground animate-pulse",
  },
  reconectando: {
    rotulo: "Reconectando",
    classe: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ponto: "bg-amber-500 animate-pulse",
  },
  offline: {
    rotulo: "Tempo real offline",
    classe: "bg-destructive/10 text-destructive",
    ponto: "bg-destructive",
  },
};

export function DashboardCardsProtocolo({ tempoReal }: { tempoReal?: SincronizacaoTempoReal }) {
  const queryClient = useQueryClient();
  const estadoTempoReal =
    ESTADOS_TEMPO_REAL[tempoReal?.status ?? "conectado"] ?? ESTADOS_TEMPO_REAL.conectado;
  const { data, isLoading, isFetching, isError, error, refetch } = useResumoDashboardProtocolo();
  const {
    categorias,
    carregando: carregandoPessoas,
    atualizando: atualizandoPessoas,
  } = useCategoriasPostos();

  // Referências estáveis evitam recalcular todos os agrupamentos a cada render.
  const ativos = useMemo(() => data?.ativos ?? [], [data]);
  const folhas = useMemo(() => data?.folhas ?? [], [data]);

  const carregandoInicial = (isLoading && !data) || carregandoPessoas;
  const carregandoReservas = carregandoPessoas;
  const ultimaSincronizacao = data?.sincronizadoEm ?? obterUltimaSincronizacaoProtocolo();

  const totalAtivos = contarFolhasUnicas(ativos);
  const totalProtocolados = contarFolhasUnicas(folhas);
  const faltaProtocolar = Math.max(totalAtivos - totalProtocolados, 0);
  /** Base do progresso: nunca menor que o total já protocolado, evitando "1 de 0". */
  const baseProgresso = Math.max(totalAtivos, totalProtocolados);
  const percentualConcluido =
    baseProgresso > 0 ? Math.min(100, Math.round((totalProtocolados / baseProgresso) * 100)) : 0;
  const legendaPendentes =
    totalAtivos === 0
      ? "Importe funcionários ativos"
      : faltaProtocolar > 0
        ? "Ainda sem protocolo"
        : "Tudo protocolado";

  const reservas = useMemo(() => {
    const definir = (
      chave: string,
      titulo: string,
      icone: React.ReactNode,
      corBorda: string,
      corFundo: string,
      corValor: string,
    ) => {
      const nomesMesclados = categorias[chave] ?? [];
      return {
        titulo,
        valor: nomesMesclados.length,
        icone,
        corBorda,
        corFundo,
        corValor,
        nomes: nomesMesclados,
      };
    };

    return [
      definir(
        "reserva-noturno",
        "RESERVA - PORTARIA - NOTURNO",
        <Moon className="h-4 w-4" />,
        "border-violet-400/30",
        "bg-violet-500/5",
        "text-violet-600 dark:text-violet-400",
      ),
      definir(
        "reserva-portaria-diurno",
        "RESERVA - PORTARIA - DIURNO",
        <DoorOpen className="h-4 w-4" />,
        "border-blue-400/30",
        "bg-blue-500/5",
        "text-blue-600 dark:text-blue-400",
      ),
      definir(
        "reserva-asg-tektron",
        "RESERVA - ASG - TEKTRON",
        <Briefcase className="h-4 w-4" />,
        "border-emerald-400/30",
        "bg-emerald-500/5",
        "text-emerald-600 dark:text-emerald-400",
      ),
      definir(
        "reserva-encarregados",
        "RESERVA ENCARREGADOS",
        <UserCog className="h-4 w-4" />,
        "border-amber-400/30",
        "bg-amber-500/5",
        "text-amber-600 dark:text-amber-400",
      ),
      definir(
        "jatista",
        "JATISTA",
        <SprayCan className="h-4 w-4" />,
        "border-cyan-400/30",
        "bg-cyan-500/5",
        "text-cyan-600 dark:text-cyan-400",
      ),
    ];
  }, [categorias]);

  /** Contadores de folhas já protocoladas agrupadas por lotação (posto). */
  const folhasPorLotacao = useMemo(() => {
    const contagem = new Map<string, { rotulo: string; total: number }>();
    const vistas = new Set<string>();

    for (const f of folhas) {
      const rotuloBruto = String(f.posto ?? "").trim();
      const rotulo = rotuloBruto || "Sem lotação informada";
      const chaveLotacao = normalizarTextoProtocolo(rotulo);
      const chaveFolha = `${chaveLotacao}|${normalizarTextoProtocolo(String(f.empresa ?? ""))}|${normalizarTextoProtocolo(String(f.colaborador ?? ""))}`;
      if (vistas.has(chaveFolha)) continue;
      vistas.add(chaveFolha);

      const atual = contagem.get(chaveLotacao);
      if (atual) atual.total += 1;
      else contagem.set(chaveLotacao, { rotulo, total: 1 });
    }

    const lista = [...contagem.values()].sort(
      (a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"),
    );

    return {
      lista,
      total: lista.reduce((soma, item) => soma + item.total, 0),
      itens: lista.map((item) => ({
        nome: item.rotulo,
        empresa: `${item.total.toLocaleString("pt-BR")} folha${item.total === 1 ? "" : "s"}`,
      })),
    };
  }, [folhas]);

  async function handleSincronizarDashboard() {
    try {
      await sincronizarDashboardProtocoloFolhas(queryClient);
      await refetch();
      toast.success("Dashboard sincronizado com o banco de dados.");
    } catch (erro) {
      registrarFalhaSincronizacaoProtocolo("dashboard-manual", erro);
      toast.error("Não foi possível sincronizar o dashboard agora.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Sincronização do Dashboard</p>
            <p className="text-xs text-muted-foreground">
              Cards, preview e banco usam a mesma fonte e a mesma chave única de folha.
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              Última sincronização: {formatarDataHora(ultimaSincronizacao)}
            </p>
            {tempoReal?.ultimaAtualizacaoRemota && (
              <p className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                Atualização de outro usuário: {formatarDataHora(tempoReal.ultimaAtualizacaoRemota)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${estadoTempoReal.classe}`}
          >
            <span className={`size-1.5 rounded-full ${estadoTempoReal.ponto}`} />
            {isFetching || atualizandoPessoas ? "Sincronizando" : estadoTempoReal.rotulo}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSincronizarDashboard()}
            disabled={isFetching}
            className="gap-2"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar Dashboard
          </Button>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falha ao sincronizar o dashboard</AlertTitle>
          <AlertDescription>
            Não foi possível consultar os dados atualizados no banco. A falha foi registrada para
            análise e nenhuma informação sensível foi exibida.
            {error instanceof Error && error.message ? ` Motivo: ${error.message}` : ""}
          </AlertDescription>
        </Alert>
      )}

      {!carregandoInicial && !isError && ativos.length === 0 && folhas.length === 0 && (
        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>Nenhum dado encontrado</AlertTitle>
          <AlertDescription>
            Importe funcionários ativos ou salve protocolos para que os indicadores sejam
            calculados.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Progresso da protocolação</p>
          <p className="text-sm tabular-nums text-muted-foreground">
            <span className="font-bold text-foreground">
              {totalProtocolados.toLocaleString("pt-BR")}
            </span>
            {" de "}
            {totalAtivos.toLocaleString("pt-BR")} folhas · {percentualConcluido}%
          </p>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out"
            style={{ width: `${percentualConcluido}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <CardKpi
          titulo="Folhas importadas"
          valor={totalAtivos}
          legenda="Funcionários ativos"
          carregando={carregandoInicial}
          icone={<Users className="h-4 w-4" />}
          corBorda="border-primary/30"
          corFundo="bg-primary/5"
          corValor="text-primary"
        />
        <CardKpi
          titulo="Protocoladas"
          valor={totalProtocolados}
          legenda={`${percentualConcluido}% do total`}
          carregando={carregandoInicial}
          icone={<CheckCircle2 className="h-4 w-4" />}
          corBorda="border-emerald-500/30"
          corFundo="bg-emerald-500/5"
          corValor="text-emerald-600 dark:text-emerald-400"
        />
        <CardKpi
          titulo="Pendentes"
          valor={faltaProtocolar}
          legenda={faltaProtocolar > 0 ? "Ainda sem protocolo" : "Tudo protocolado"}
          carregando={carregandoInicial}
          icone={<AlertTriangle className="h-4 w-4" />}
          corBorda="border-destructive/30"
          corFundo="bg-destructive/5"
          corValor={faltaProtocolar > 0 ? "text-destructive" : "text-muted-foreground"}
        />
        <CardKpi
          titulo="INSS"
          valor={(categorias["inss"] ?? []).length}
          nomes={categorias["inss"] ?? []}
          carregando={carregandoInicial}
          icone={<ShieldAlert className="h-4 w-4" />}
          corBorda="border-red-400/30"
          corFundo="bg-red-500/5"
          corValor="text-red-600 dark:text-red-400"
        />
        <CardKpi
          titulo="Desaparecidos"
          valor={(categorias["desaparecidos"] ?? []).length}
          nomes={categorias["desaparecidos"] ?? []}
          carregando={carregandoInicial}
          icone={<EyeOff className="h-4 w-4" />}
          corBorda="border-orange-400/30"
          corFundo="bg-orange-500/5"
          corValor="text-orange-600 dark:text-orange-400"
        />
        <CardKpi
          titulo="Maternidade"
          valor={(categorias["maternidade"] ?? []).length}
          nomes={categorias["maternidade"] ?? []}
          carregando={carregandoInicial}
          icone={<Baby className="h-4 w-4" />}
          corBorda="border-pink-400/30"
          corFundo="bg-pink-500/5"
          corValor="text-pink-600 dark:text-pink-400"
        />
        <CardKpi
          titulo="Audiência"
          valor={(categorias["audiencia"] ?? []).length}
          nomes={categorias["audiencia"] ?? []}
          carregando={carregandoInicial}
          icone={<Gavel className="h-4 w-4" />}
          corBorda="border-purple-400/30"
          corFundo="bg-purple-500/5"
          corValor="text-purple-600 dark:text-purple-400"
        />
        {reservas.map((r) => (
          <CardKpi
            key={r.titulo}
            titulo={r.titulo}
            valor={r.valor}
            nomes={r.nomes}
            carregando={carregandoReservas}
            icone={r.icone}
            corBorda={r.corBorda}
            corFundo={r.corFundo}
            corValor={r.corValor}
          />
        ))}
      </div>
    </div>
  );
}
