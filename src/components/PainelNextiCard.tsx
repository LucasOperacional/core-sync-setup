import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Filter,
  MapPin,
  RefreshCw,
  UserX,
  Users,
  X,
} from "lucide-react";
import {
  assinarNextiRealtime,
  carregarAtividadeGerente,
  carregarResumoControlNexti,
  listarEmpresasNexti,
  listarGerentesArea,
  type AtividadeGerente,
  type EmpresaNexti,
  type NextiControlResumo,
} from "@/lib/nexti-dashboards";
import { NextiSyncStatus } from "@/components/NextiSyncStatus";

/** Painel de indicadores operacionais vindos da NEXTI, exibido na página inicial. */
export function PainelNextiCard() {
  const [resumo, setResumo] = useState<NextiControlResumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [empresas, setEmpresas] = useState<EmpresaNexti[]>([]);
  const [gerentes, setGerentes] = useState<string[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [gerente, setGerente] = useState<string>("");
  const [atividade, setAtividade] = useState<AtividadeGerente | null>(null);

  useEffect(() => {
    void listarEmpresasNexti()
      .then(setEmpresas)
      .catch(() => setEmpresas([]));
    void listarGerentesArea()
      .then(setGerentes)
      .catch(() => setGerentes([]));
  }, []);

  const atualizar = useCallback(() => {
    setCarregando(true);
    void carregarResumoControlNexti({
      empresaId: empresaId ? Number(empresaId) : null,
      gerente: gerente || null,
    })
      .then(setResumo)
      .catch(() => setResumo(null))
      .finally(() => setCarregando(false));
    void carregarAtividadeGerente({
      empresaId: empresaId ? Number(empresaId) : null,
      gerente: gerente || null,
    })
      .then(setAtividade)
      .catch(() => setAtividade(null));
  }, [empresaId, gerente]);

  useEffect(() => {
    atualizar();
    return assinarNextiRealtime(atualizar);
  }, [atualizar]);

  const itens = [
    { icon: Users, label: "Colaboradores ativos", value: resumo?.pessoasAtivas },
    { icon: MapPin, label: "Postos NEXTI", value: resumo?.postos },
    { icon: Clock, label: "Marcações hoje", value: resumo?.marcacoesHoje },
    { icon: CalendarDays, label: "Ausências em curso", value: resumo?.ausenciasAbertas },
    { icon: ClipboardList, label: "Atestados no mês", value: resumo?.atestadosMes },
  ];

  const temFiltro = empresaId !== "" || gerente !== "";

  return (
    <section className="w-full max-w-5xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Painel NEXTI</h2>
          <p className="text-sm text-muted-foreground">
            Indicadores operacionais sincronizados diretamente da NEXTI.
          </p>
        </div>
        <button
          type="button"
          onClick={atualizar}
          disabled={carregando}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${carregando ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="size-4 text-primary" />
          Filtros
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Empresa
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="min-w-[220px] rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todas as empresas ({empresas.length})</option>
            {empresas.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Gerente de área
          <select
            value={gerente}
            onChange={(e) => setGerente(e.target.value)}
            className="min-w-[220px] rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todos os gerentes ({gerentes.length})</option>
            {gerentes.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setEmpresaId("");
              setGerente("");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="size-4" />
            Limpar
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {itens.map((i) => (
          <div
            key={i.label}
            className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-left"
          >
            <i.icon className="size-5 text-primary" />
            <span className="text-2xl font-bold text-foreground">
              {i.value === undefined ? "—" : i.value}
            </span>
            <span className="text-xs text-muted-foreground">{i.label}</span>
          </div>
        ))}
      </div>

      {/* Sincronização automática com a API da NEXTI (áreas, pessoas, ponto, faltas e Control) */}
      <div className="mt-5">
        <NextiSyncStatus
          modulos={["workplaces", "persons", "clockings", "absences"]}
          titulo="Sincronização automática NEXTI"
          onAtualizar={atualizar}
        />
      </div>

      {/* Atividades do gerente de área A selecionado */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
        <h3 className="text-sm font-bold text-foreground">
          Atividades do Gerente de Área A{gerente ? ` — ${gerente}` : ""}
        </h3>
        {!gerente ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione um Gerente de Área A no filtro para ver faltas lançadas, relatórios do Control
            e o ranking de inconsistências de ponto.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Últimos {atividade?.diasAnalisados ?? 30} dias, sincronizado com a API da NEXTI.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  icon: ClipboardCheck,
                  label: "Relatórios Control feitos",
                  value: atividade?.controlsFeitos,
                },
                { icon: CalendarDays, label: "Faltas lançadas", value: atividade?.faltasLancadas },
                {
                  icon: Clock,
                  label: "Marcações registradas",
                  value: atividade?.marcacoesRealizadas,
                },
                {
                  icon: AlertTriangle,
                  label: "Marcações não realizadas",
                  value: atividade?.marcacoesFaltantes,
                },
                { icon: Users, label: "Colaboradores na área", value: atividade?.colaboradores },
              ].map((i) => (
                <div
                  key={i.label}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <i.icon className="size-5 text-primary" />
                  <span className="text-2xl font-bold text-foreground">
                    {i.value === undefined ? "—" : i.value}
                  </span>
                  <span className="text-xs text-muted-foreground">{i.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <UserX className="size-4 text-primary" />
                Ranking de inconsistências de ponto
              </h4>
              {atividade && atividade.ranking.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {atividade.ranking.map((r, idx) => (
                    <li
                      key={r.personId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-6 shrink-0 text-sm font-bold text-primary">
                          {idx + 1}º
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{r.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.posto || "Sem posto"}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-destructive">
                          {r.diasSemMarcacao} dias sem marcar
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.diasComMarcacao} dias com ponto
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nenhuma inconsistência de ponto encontrada para os postos deste gerente.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
