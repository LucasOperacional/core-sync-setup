import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { WidgetBoard } from "@/components/widgets/WidgetBoard";

import {
  ArrowLeft,
  CalendarX2,
  Download,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  X,
  Filter,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  AlertTriangle,
  Users,
  UserCheck,
  Home,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type ParsedRow } from "@/lib/file-parsers";
import {
  carregarFaltasDashboardNexti,
  postoDeveAparecerNoDashboardFaltas,
} from "@/lib/nexti-ativos.functions";

import { sincronizarFaltasLancadas } from "@/lib/faltas-lancamentos.functions";
import { extrairTodosRegistros, temCabecalho } from "@/lib/tabular-extract";
import { KpiCard } from "@/components/KpiCard";

import { Badge } from "@/components/ui/badge";
import { buildMonthlySeries, downloadCsv } from "@/lib/dashboard-utils";
import {
  GERENTES_AREA_A,
  NOMES_GERENTES_IGNORAR,
  gerenteAreaACanonico,
  normalizarNome,
  removerNomesIgnorados,
} from "@/lib/gerentes-area-a";

export const Route = createFileRoute("/_authenticated/faltas")({
  head: () => ({
    meta: [
      { title: "Faltas — Dashboard | NextiControl" },
      { name: "description", content: "Dashboard de faltas com indicadores, filtros e gráficos." },
    ],
  }),
  component: FaltasPage,
});

const FALTAS_STORAGE_KEY = "nexti-faltas-rows-v1";

const CHART_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#a855f7",
];

function paletteColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? "#10b981";
}

const GERENTES_VALIDADOS: string[] = [...GERENTES_AREA_A];

const GERENTES_GRAFICO_REGISTROS: string[] = [
  "TIAGO LOPES FERREIRA",
  "VIVIAN DE CARVALHO MORENO",
  "ROBSON DOUGLAS SOARES SOUSA",
  "PAULO HENRIQUE ABREU RIBEIRO",
  "JOAO MENDES DE SOUZA",
  "GABRIEL MENDANHA CABRAL",
  "EDUARDO ALENCAR DA SILVA",
  "WILLIAMAR DE RESENDE",
  "JOAO CARLOS RODRIGUES DA SILVA",
];

function isGerenteRegistrosPermitido(gerenteFromData: string): boolean {
  const canonico = matchGerente(gerenteFromData);
  if (!canonico) return false;
  return GERENTES_GRAFICO_REGISTROS.some((g) => normalizarNome(g) === normalizarNome(canonico));
}

const CARD_COLORS = [
  { bg: "bg-indigo-500/15", text: "text-indigo-400", border: "border-indigo-500/30" },
  { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
  { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
  { bg: "bg-violet-500/15", text: "text-violet-400", border: "border-violet-500/30" },
  { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30" },
  { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  { bg: "bg-pink-500/15", text: "text-pink-400", border: "border-pink-500/30" },
];

type ImportedFile = { name: string; rowCount: number };

const TARGET_COLUMNS = [
  {
    key: "posto",
    labels: ["posto", "posto/centro de custo", "centro de custo", "local", "unidade"],
  },
  {
    key: "colaborador",
    labels: [
      "colaborador",
      "nome",
      "funcionario",
      "funcionário",
      "empregado",
      "profissional",
      "vigilante",
    ],
  },
  { key: "cargo", labels: ["cargo", "função", "funcao", "ocupação", "ocupacao"] },
  {
    key: "gerente",
    labels: [
      "area",
      "área",
      "gerente",
      "gerente de area",
      "gerente de área",
      "gerente area",
      "gerente área",
      "gestor",
      "supervisor",
      "responsavel",
      "responsável",
      "gerente regional",
      "coordenador",
    ],
  },
  {
    key: "dataInicio",
    labels: [
      "data inicio",
      "data início",
      "inicio",
      "início",
      "dt inicio",
      "dt início",
      "data_inicio",
      "entrada",
      "check-in",
      "checkin",
    ],
  },
  {
    key: "dataFim",
    labels: [
      "data fim",
      "fim",
      "dt fim",
      "data_fim",
      "saida",
      "saída",
      "check-out",
      "checkout",
      "término",
      "termino",
    ],
  },
  {
    key: "faltas",
    labels: [
      "faltas",
      "falta",
      "ausencia",
      "ausência",
      "ausencias",
      "ausências",
      "qtd faltas",
      "total faltas",
      "dias falta",
    ],
  },
  {
    key: "tipo",
    labels: ["tipo", "tipo de ausencia", "tipo de ausência", "ocorrencia", "ocorrência"],
  },
  {
    key: "motivo",
    labels: [
      "motivo",
      "motivo da falta",
      "justificativa",
      "observacao",
      "observação",
      "obs",
      "descricao",
      "descrição",
    ],
  },
];

type ExtractedRow = {
  posto: string;
  colaborador: string;
  cargo: string;
  gerente: string;
  periodo: string;
  faltas: string;
  tipo: string;
  motivo: string;
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectColumns(rows: ParsedRow[]): boolean {
  return temCabecalho(rows, TARGET_COLUMNS, 2);
}

function extractDateOnly(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^(\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4})\s+\d{1,2}:\d{2}(:\d{2})?$/);
  if (match) {
    return match[1] ?? trimmed;
  }

  return trimmed;
}

function buildPeriodo(dataInicio: string, dataFim: string): string {
  const inicio = extractDateOnly(dataInicio);
  const fim = extractDateOnly(dataFim);

  if (inicio && fim) {
    if (inicio === fim) return inicio;
    return `${inicio} — ${fim}`;
  }
  if (inicio) return inicio;
  if (fim) return fim;
  return "";
}

function postoDeveAparecerNoDashboard(posto: string): boolean {
  // Postos FGR e postos cujo nome começa com "Ts" são ignorados no dashboard de faltas.
  if (!postoDeveAparecerNoDashboardFaltas(posto)) return false;
  const p = posto.trim().toUpperCase();
  return !p.startsWith("FGR");
}


function extractRows(rows: ParsedRow[]): ExtractedRow[] {
  return extrairTodosRegistros<ExtractedRow>(rows, TARGET_COLUMNS, 2, (row, mapping) => {
    const dataInicio = (row[mapping["dataInicio"] ?? -1] ?? "").trim();
    const dataFim = (row[mapping["dataFim"] ?? -1] ?? "").trim();
    const posto = (row[mapping["posto"] ?? -1] ?? "").trim();
    const item: ExtractedRow = {
      posto,
      colaborador: (row[mapping["colaborador"] ?? -1] ?? "").trim(),
      cargo: (row[mapping["cargo"] ?? -1] ?? "").trim(),
      gerente: (row[mapping["gerente"] ?? -1] ?? "").trim(),
      periodo: buildPeriodo(dataInicio, dataFim),
      faltas: (row[mapping["faltas"] ?? -1] ?? "").trim(),
      tipo: (row[mapping["tipo"] ?? -1] ?? "").trim().toUpperCase(),
      motivo: (row[mapping["motivo"] ?? -1] ?? "").trim(),
    };
    const temConteudo =
      item.colaborador !== "" ||
      item.posto !== "" ||
      item.cargo !== "" ||
      item.gerente !== "" ||
      item.periodo !== "" ||
      item.faltas !== "";
    if (!temConteudo) return null;
    if (!postoDeveAparecerNoDashboard(posto)) return null;
    return item;
  });
}

function parseFaltasValue(val: string): number {
  const num = parseInt(val, 10);
  if (!isNaN(num)) return num;
  if (val.toLowerCase() === "sim" || val === "1") return 1;
  return 0;
}

function parseDateFromString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1]!, 10);
    const month = parseInt(brMatch[2]!, 10) - 1;
    const year = parseInt(brMatch[3]!, 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]!, 10);
    const month = parseInt(isoMatch[2]!, 10) - 1;
    const day = parseInt(isoMatch[3]!, 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function getStartDateFromPeriodo(periodo: string): Date | null {
  if (!periodo) return null;
  const parts = periodo.split("—");
  const startStr = (parts[0] ?? "").trim();
  return parseDateFromString(startStr);
}

function isMesVigente(periodo: string): boolean {
  const date = getStartDateFromPeriodo(periodo);
  if (!date) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

/** Match a gerente name from the data against the validated list (accent & case insensitive) */
function matchGerente(gerenteFromData: string): string | null {
  return gerenteAreaACanonico(gerenteFromData);
}

/* Custom chart tooltip using theme colors — wide enough to show full labels */
function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-max max-w-xs rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="whitespace-nowrap text-xs font-medium text-foreground">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="whitespace-nowrap text-sm font-bold text-foreground">
          {entry.name ?? entry.dataKey}: {entry.value}
        </p>
      ))}
    </div>
  );
}

/* Tooltip detalhado do Top 10 — mostra dados reais do colaborador */
function TopColaboradorTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="min-w-max max-w-xs rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="whitespace-nowrap text-xs font-semibold text-foreground">{d.nomeCompleto}</p>
      {d.cargo && <p className="whitespace-nowrap text-xs text-muted-foreground">{d.cargo}</p>}
      {d.posto && <p className="whitespace-nowrap text-xs text-muted-foreground">{d.posto}</p>}
      <p className="whitespace-nowrap text-sm font-bold text-foreground">
        {d.quantidade} dia(s) de falta · {d.ocorrencias} ocorrência(s)
      </p>
      {Array.isArray(d.motivos) && d.motivos.length > 0 && (
        <div className="mt-1 border-t border-border pt-1">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Motivo(s)
          </p>
          {d.motivos.map((m: { nome: string; qtd: number }, idx: number) => (
            <p key={idx} className="whitespace-nowrap text-xs text-foreground">
              {m.nome} — {m.qtd}x
            </p>
          ))}
        </div>
      )}
      {Array.isArray(d.motivosReais) && d.motivosReais.length > 0 && (
        <div className="mt-1 border-t border-border pt-1">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Justificativa registrada
          </p>
          {d.motivosReais.map((m: string, idx: number) => (
            <p key={idx} className="max-w-[260px] whitespace-normal text-xs text-foreground">
              {m}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function FaltasPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [nextiCarregando, setNextiCarregando] = useState(false);
  const [nextiErro, setNextiErro] = useState<string | null>(null);
  const [nextiEm, setNextiEm] = useState<string | null>(null);


  const [showFilters, setShowFilters] = useState(false);
  const [filterPosto, setFilterPosto] = useState("");
  const [filterColaborador, setFilterColaborador] = useState("");
  const [filterCargo, setFilterCargo] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterGerente, setFilterGerente] = useState("");
  const [filterFaltasMin, setFilterFaltasMin] = useState("");
  const [filterFaltasMax, setFilterFaltasMax] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Load rows from localStorage (imported via Admin)
  const loadFromStorage = () => {
    try {
      const raw = localStorage.getItem(FALTAS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ParsedRow[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRows(parsed);
          return;
        }
      }
      setRows([]);
    } catch {
      setRows([]);
    }
  };

  // Carrega o dashboard direto da API da NEXTI.
  // `silencioso` atualiza em segundo plano, sem travar a tela.
  const puxarDaNexti = useCallback(async (forcar: boolean, silencioso = false) => {
    if (!silencioso) setNextiCarregando(true);
    setNextiErro(null);
    try {
      const res = await carregarFaltasDashboardNexti({ data: { forcarSincronizar: forcar } });
      if (!res.ok) throw new Error(res.erro || "Falha ao consultar a NEXTI.");
      if (res.linhas.length === 0) {
        if (!silencioso) {
          setNextiErro("A NEXTI não retornou nenhuma ausência no período consultado.");
        }
        return;
      }
      const tabela: ParsedRow[] = [
        ["POSTO", "COLABORADOR", "CARGO", "GERENTE", "DATA INICIO", "DATA FIM", "FALTAS", "TIPO", "MOTIVO"],
        ...res.linhas.map((l) => [
          l.posto,
          l.colaborador,
          l.cargo,
          l.gerente,
          l.dataInicio,
          l.dataFim,
          l.faltas,
          l.tipo,
          l.motivo,
        ]),
      ];
      setRows(tabela);
      setNextiEm(res.sincronizadoEm);
      try {
        localStorage.setItem(FALTAS_STORAGE_KEY, JSON.stringify(tabela));
      } catch {
        /* armazenamento cheio: segue só em memória */
      }
    } catch (err) {
      if (!silencioso) {
        setNextiErro(err instanceof Error ? err.message : "Falha ao consultar a NEXTI.");
      }
    } finally {
      if (!silencioso) setNextiCarregando(false);
    }
  }, []);

  useEffect(() => {
    // Abre instantaneamente com o último conteúdo salvo e atualiza em segundo
    // plano reaproveitando o cache do servidor (sem forçar nova varredura).
    loadFromStorage();
    void puxarDaNexti(false, true);
    const id = window.setInterval(() => void puxarDaNexti(true, true), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [puxarDaNexti]);


  // Listen for storage changes (if admin imports in another tab)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === FALTAS_STORAGE_KEY) {
        try {
          const raw = e.newValue;
          if (raw) {
            const parsed = JSON.parse(raw) as ParsedRow[];
            if (Array.isArray(parsed)) setRows(parsed);
          } else {
            setRows([]);
          }
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Listen for custom sync event dispatched from admin page (same tab)
  useEffect(() => {
    function onFaltasSync() {
      loadFromStorage();
    }
    window.addEventListener("faltas-sync", onFaltasSync);
    return () => window.removeEventListener("faltas-sync", onFaltasSync);
  }, []);

  const extracted = useMemo(() => {
    if (rows.length === 0) return null;
    if (!detectColumns(rows)) return null;
    const data = extractRows(rows);
    return { data };
  }, [rows]);

  // Espelha as faltas no banco para que cada supervisor (gerente de área)
  // veja no painel dele o que foi lançado no seu nome.
  useEffect(() => {
    if (!extracted || extracted.data.length === 0) return;
    const linhas = extracted.data
      .filter((r) => r.gerente.trim() !== "")
      .map((r) => ({
        gerente: r.gerente,
        colaborador: r.colaborador,
        posto: r.posto,
        cargo: r.cargo,
        tipo: r.tipo,
        periodo: r.periodo,
        faltas: parseFaltasValue(r.faltas),
      }));
    if (linhas.length === 0) return;
    void sincronizarFaltasLancadas({ data: { linhas } }).catch(() => {
      /* somente administradores sincronizam — ignora para os demais */
    });
  }, [extracted]);

  const filterOptions = useMemo(() => {
    if (!extracted) return { postos: [], colaboradores: [], cargos: [], gerentes: [], tipos: [] };
    const postos = Array.from(new Set(extracted.data.map((r) => r.posto).filter(Boolean))).sort();
    const colaboradores = Array.from(
      new Set(extracted.data.map((r) => r.colaborador).filter(Boolean)),
    ).sort();
    const cargos = Array.from(new Set(extracted.data.map((r) => r.cargo).filter(Boolean))).sort();
    const tipos = Array.from(
      new Set(extracted.data.map((r) => r.tipo).filter(Boolean)),
    ).sort() as string[];
    // Filtro de Gerente de Área restrito à lista oficial (sem duplicados nem vazios)
    const gerentes = Array.from(new Set(GERENTES_VALIDADOS.filter((g) => g.trim() !== "")));
    return { postos, colaboradores, cargos, gerentes, tipos };
  }, [extracted]);

  const filteredData = useMemo(() => {
    if (!extracted) return [];
    let data = extracted.data
      .map((r) => {
        const originalGerente = r.gerente.trim();
        const gerente = removerNomesIgnorados(r.gerente);
        return { ...r, gerente, originalGerente };
      })
      // Remove registros cujo único gerente era um nome ignorado;
      // mantém registros sem gerente informado.
      .filter((r) => r.originalGerente === "" || r.gerente !== "")
      .map(({ originalGerente, ...r }) => r);

    if (filterPosto) {
      data = data.filter((r) => r.posto === filterPosto);
    }
    if (filterColaborador) {
      data = data.filter((r) => r.colaborador === filterColaborador);
    }
    if (filterCargo) {
      data = data.filter((r) => r.cargo === filterCargo);
    }
    if (filterTipo) {
      data = data.filter((r) => (r.tipo || "NÃO INFORMADO") === filterTipo);
    }
    if (filterGerente) {
      data = data.filter((r) => matchGerente(r.gerente) === filterGerente);
    }
    if (filterFaltasMin !== "") {
      const min = parseInt(filterFaltasMin, 10);
      if (!isNaN(min)) {
        data = data.filter((r) => parseFaltasValue(r.faltas) >= min);
      }
    }
    if (filterFaltasMax !== "") {
      const max = parseInt(filterFaltasMax, 10);
      if (!isNaN(max)) {
        data = data.filter((r) => parseFaltasValue(r.faltas) <= max);
      }
    }

    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom + "T00:00:00");
      if (!isNaN(fromDate.getTime())) {
        data = data.filter((r) => {
          const rowDate = getStartDateFromPeriodo(r.periodo);
          if (!rowDate) return false;
          return rowDate >= fromDate;
        });
      }
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo + "T23:59:59");
      if (!isNaN(toDate.getTime())) {
        data = data.filter((r) => {
          const rowDate = getStartDateFromPeriodo(r.periodo);
          if (!rowDate) return false;
          return rowDate <= toDate;
        });
      }
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.filter(
        (r) =>
          r.posto.toLowerCase().includes(term) ||
          r.colaborador.toLowerCase().includes(term) ||
          r.cargo.toLowerCase().includes(term) ||
          r.gerente.toLowerCase().includes(term) ||
          r.periodo.toLowerCase().includes(term) ||
          r.faltas.toLowerCase().includes(term),
      );
    }

    return data;
  }, [
    extracted,
    filterPosto,
    filterColaborador,
    filterCargo,
    filterTipo,
    filterGerente,
    filterFaltasMin,
    filterFaltasMax,
    filterDateFrom,
    filterDateTo,
    searchTerm,
  ]);

  const stats = useMemo(() => {
    if (!extracted || filteredData.length === 0) return null;

    const data = filteredData;
    const totalRows = data.length;
    const totalFaltas = data.reduce((acc, r) => acc + parseFaltasValue(r.faltas), 0);
    const uniqueColaboradores = new Set(data.map((r) => r.colaborador).filter(Boolean)).size;
    const uniquePostos = new Set(data.map((r) => r.posto).filter(Boolean)).size;
    const absenteeismRate = totalRows > 0 ? ((totalFaltas / totalRows) * 100).toFixed(1) : "0.0";

    const faltasPorColaborador = new Map<string, number>();
    const colaboradorInfo = new Map<
      string,
      { nome: string; posto: string; cargo: string; ocorrencias: number; dias: number; motivos: Map<string, number>; motivosReais: Set<string> }
    >();
    for (const r of data) {
      if (!r.colaborador) continue;
      const val = parseFaltasValue(r.faltas);
      faltasPorColaborador.set(r.colaborador, (faltasPorColaborador.get(r.colaborador) ?? 0) + val);
      const key = normalize(r.colaborador);
      const motivo = (r.tipo || "NÃO INFORMADO").trim() || "NÃO INFORMADO";
      const info = colaboradorInfo.get(key);
      if (info) {
        info.ocorrencias += 1;
        info.dias += val;
        info.motivos.set(motivo, (info.motivos.get(motivo) ?? 0) + 1);
        if (r.motivo) info.motivosReais.add(r.motivo);
        if (!info.posto && r.posto) info.posto = r.posto;
        if (!info.cargo && r.cargo) info.cargo = r.cargo;
      } else {
        colaboradorInfo.set(key, {
          nome: r.colaborador,
          posto: r.posto,
          cargo: r.cargo,
          ocorrencias: 1,
          dias: val,
          motivos: new Map([[motivo, 1]]),
          motivosReais: new Set(r.motivo ? [r.motivo] : []),
        });
      }
    }
    const barData = Array.from(colaboradorInfo.values())
      .sort((a, b) => b.dias - a.dias || b.ocorrencias - a.ocorrencias)
      .slice(0, 10)
      .map((info) => ({
        name: info.nome.length > 25 ? info.nome.slice(0, 23) + "…" : info.nome,
        nomeCompleto: info.nome,
        posto: info.posto,
        cargo: info.cargo,
        ocorrencias: info.ocorrencias,
        quantidade: info.dias,
        motivos: Array.from(info.motivos, ([nome, qtd]) => ({ nome, qtd })).sort(
          (a, b) => b.qtd - a.qtd,
        ),
        motivosReais: Array.from(info.motivosReais),
      }));

    const faltasPorPosto = new Map<string, number>();
    for (const r of data) {
      if (!r.posto) continue;
      const val = parseFaltasValue(r.faltas);
      faltasPorPosto.set(r.posto, (faltasPorPosto.get(r.posto) ?? 0) + val);
    }
    const postoBarData = Array.from(faltasPorPosto, ([name, value]) => ({
      name: name.length > 22 ? name.slice(0, 20) + "…" : name,
      faltas: value,
    }))
      .sort((a, b) => b.faltas - a.faltas)
      .slice(0, 7);

    const faltasPorCargo = new Map<string, number>();
    for (const r of data) {
      if (!r.cargo) continue;
      faltasPorCargo.set(r.cargo, (faltasPorCargo.get(r.cargo) ?? 0) + parseFaltasValue(r.faltas));
    }
    const cargoBarData = Array.from(faltasPorCargo, ([name, value]) => ({
      name: name.length > 22 ? name.slice(0, 20) + "…" : name,
      faltas: value,
    }))
      .sort((a, b) => b.faltas - a.faltas)
      .slice(0, 7);

    const serieMensal = buildMonthlySeries(
      data,
      (r) => getStartDateFromPeriodo(r.periodo),
      (r) => parseFaltasValue(r.faltas),
    );

    const tipoMap = new Map<string, number>();
    for (const r of data) {
      const tipo = r.tipo || "NÃO INFORMADO";
      tipoMap.set(tipo, (tipoMap.get(tipo) ?? 0) + 1);
    }
    const tipoData = Array.from(tipoMap, ([name, registros]) => ({ name, registros })).sort(
      (a, b) => b.registros - a.registros,
    );

    const mediaFaltasColaborador = uniqueColaboradores
      ? (totalFaltas / uniqueColaboradores).toFixed(1)
      : "0.0";

    return {
      totalRows,
      totalFaltas,
      uniqueColaboradores,
      uniquePostos,
      absenteeismRate,
      barData,
      postoBarData,
      cargoBarData,
      serieMensal,
      mediaFaltasColaborador,
      faltasPorColaborador,
      tipoData,
    };
  }, [extracted, filteredData]);

  // Série mensal filtrada apenas pelos gerentes permitidos no gráfico Registros
  const registrosSerieMensal = useMemo(() => {
    if (!extracted) return [];
    const data = filteredData.filter((r) => isGerenteRegistrosPermitido(r.gerente));
    return buildMonthlySeries(
      data,
      (r) => getStartDateFromPeriodo(r.periodo),
      (r) => parseFaltasValue(r.faltas),
    );
  }, [extracted, filteredData]);

  // Compute faltas per validated gerente (with per-lancamento details)
  const gerenteFaltasCards = useMemo(() => {
    const detalhesMap = new Map<string, ExtractedRow[]>();
    for (const gName of GERENTES_VALIDADOS) {
      detalhesMap.set(gName, []);
    }

    for (const r of filteredData ?? []) {
      const matched = matchGerente(r.gerente);
      if (matched) {
        detalhesMap.get(matched)!.push(r);
      }
    }

    return GERENTES_VALIDADOS.map((name) => {
      const detalhes = detalhesMap.get(name) ?? [];
      const faltas = detalhes.reduce((acc, r) => acc + parseFaltasValue(r.faltas), 0);
      const colaboradores = new Set(detalhes.map((r) => r.colaborador).filter(Boolean)).size;
      return { name, faltas, colaboradores, lancamentos: detalhes.length, detalhes };
    });
  }, [filteredData]);

  const [gerenteAberto, setGerenteAberto] = useState<string | null>(null);

  function clearFilters() {
    setFilterPosto("");
    setFilterColaborador("");
    setFilterCargo("");
    setFilterGerente("");
    setFilterFaltasMin("");
    setFilterFaltasMax("");
    setFilterTipo("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  const hasActiveFilters =
    filterPosto ||
    filterColaborador ||
    filterCargo ||
    filterTipo ||
    filterGerente ||
    filterFaltasMin ||
    filterFaltasMax ||
    filterDateFrom ||
    filterDateTo;

  const hasData = rows.length > 0;
  const columnsDetected = extracted !== null;

  function exportarCsv() {
    downloadCsv(
      "faltas",
      ["Posto", "Colaborador", "Cargo", "Gerente", "Período", "Faltas"],
      filteredData.map((r) => [r.posto, r.colaborador, r.cargo, r.gerente, r.periodo, r.faltas]),
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <CalendarX2 className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Faltas — Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Visualize: Posto, Colaborador, Cargo, Período e Faltas. Importe os dados pelo Painel
              Admin.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={loadFromStorage}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              <RefreshCw className="size-4" /> Atualizar
            </button>

            {columnsDetected && filteredData.length > 0 ? (
              <button
                type="button"
                onClick={exportarCsv}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Download className="size-4" /> Exportar CSV
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
        {/* No data state */}


        {!hasData && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
            <span className="rounded-xl bg-primary/10 p-3 text-primary">
              <FileUp className="size-6" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              Nenhum dado de faltas importado ainda.
            </p>
            <p className="text-xs text-muted-foreground">
              Importe arquivos CSV, XLSX, XLS ou PDF pelo Painel Admin.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/admin" })}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ir para o Painel Admin
            </button>
          </div>
        )}

        {/* Warning if data imported but columns not detected */}
        {hasData && !columnsDetected && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-center">
            <p className="text-sm font-medium text-yellow-300">
              Não foi possível detectar automaticamente as colunas (Posto, Colaborador, Cargo, Data
              Início, Data Fim, Faltas).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Verifique se o arquivo possui um cabeçalho com essas colunas. {rows.length} linha(s)
              bruta(s) importada(s).
            </p>
          </div>
        )}

        <WidgetBoard
          dashboard="faltas"
          widgets={[
            ...(columnsDetected
              ? [
                  {
                    key: "filtros",
                    titulo: "Filtros",
                    tamanho: "grande" as const,
                    conteudo: (
                      <section className="space-y-3">
                        <button
                          type="button"
                          onClick={() => setShowFilters((v) => !v)}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
                        >
                          <Filter className="size-4 text-primary" />
                          Filtros
                          {hasActiveFilters && (
                            <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                              {
                                [
                                  filterPosto,
                                  filterColaborador,
                                  filterCargo,
                                  filterTipo,
                                  filterGerente,
                                  filterFaltasMin,
                                  filterFaltasMax,
                                  filterDateFrom,
                                  filterDateTo,
                                ].filter(Boolean).length
                              }
                            </span>
                          )}
                          {showFilters ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </button>

                        {showFilters && (
                          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                              {/* Posto */}
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-posto"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Posto
                                </label>
                                <select
                                  id="filter-posto"
                                  value={filterPosto}
                                  onChange={(e) => setFilterPosto(e.target.value)}
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  <option value="" className="bg-secondary text-foreground">
                                    Todos
                                  </option>
                                  {filterOptions.postos.map((p) => (
                                    <option
                                      key={p}
                                      value={p}
                                      className="bg-secondary text-foreground"
                                    >
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Colaborador */}
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-colaborador"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Colaborador
                                </label>
                                <select
                                  id="filter-colaborador"
                                  value={filterColaborador}
                                  onChange={(e) => setFilterColaborador(e.target.value)}
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  <option value="" className="bg-secondary text-foreground">
                                    Todos
                                  </option>
                                  {filterOptions.colaboradores.map((c) => (
                                    <option
                                      key={c}
                                      value={c}
                                      className="bg-secondary text-foreground"
                                    >
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Cargo */}
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-cargo"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Cargo
                                </label>
                                <select
                                  id="filter-cargo"
                                  value={filterCargo}
                                  onChange={(e) => setFilterCargo(e.target.value)}
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  <option value="" className="bg-secondary text-foreground">
                                    Todos
                                  </option>
                                  {filterOptions.cargos.map((c) => (
                                    <option
                                      key={c}
                                      value={c}
                                      className="bg-secondary text-foreground"
                                    >
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Tipo de ausência */}
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-tipo"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Tipo de ausência
                                </label>
                                <select
                                  id="filter-tipo"
                                  value={filterTipo}
                                  onChange={(e) => setFilterTipo(e.target.value)}
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  <option value="" className="bg-secondary text-foreground">
                                    Todos
                                  </option>
                                  {filterOptions.tipos.map((t) => (
                                    <option
                                      key={t}
                                      value={t}
                                      className="bg-secondary text-foreground"
                                    >
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Gerente de Área */}
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-gerente"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Gerente de Área
                                </label>
                                <select
                                  id="filter-gerente"
                                  value={filterGerente}
                                  onChange={(e) => setFilterGerente(e.target.value)}
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  <option value="" className="bg-secondary text-foreground">
                                    Todos
                                  </option>
                                  {filterOptions.gerentes.map((g) => (
                                    <option
                                      key={g}
                                      value={g}
                                      className="bg-secondary text-foreground"
                                    >
                                      {g}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Faltas range + Date range */}
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-faltas-min"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Faltas mín.
                                </label>
                                <input
                                  id="filter-faltas-min"
                                  type="number"
                                  min={0}
                                  value={filterFaltasMin}
                                  onChange={(e) => setFilterFaltasMin(e.target.value)}
                                  placeholder="0"
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-faltas-max"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Faltas máx.
                                </label>
                                <input
                                  id="filter-faltas-max"
                                  type="number"
                                  min={0}
                                  value={filterFaltasMax}
                                  onChange={(e) => setFilterFaltasMax(e.target.value)}
                                  placeholder="∞"
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-date-from"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Período de
                                </label>
                                <input
                                  id="filter-date-from"
                                  type="date"
                                  value={filterDateFrom}
                                  onChange={(e) => setFilterDateFrom(e.target.value)}
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="filter-date-to"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Período até
                                </label>
                                <input
                                  id="filter-date-to"
                                  type="date"
                                  value={filterDateTo}
                                  onChange={(e) => setFilterDateTo(e.target.value)}
                                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              </div>
                            </div>

                            {hasActiveFilters && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={clearFilters}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted"
                                >
                                  <X className="size-3.5" /> Limpar filtros
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                    ),
                  },
                ]
              : []),
            ...(columnsDetected
              ? [
                  {
                    key: "busca",
                    titulo: "Busca",
                    tamanho: "grande" as const,
                    conteudo: (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Buscar por posto, colaborador, cargo, gerente..."
                          className="w-full rounded-lg border border-border bg-secondary py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                    ),
                  },
                ]
              : []),
            ...(stats
              ? [
                  {
                    key: "kpi-registros",
                    titulo: "Total de registros",
                    tamanho: "pequeno" as const,
                    conteudo: (
                      <KpiCard
                        label="Total de registros"
                        value={String(stats.totalRows)}
                        hint={`${stats.uniquePostos} posto(s) distintos`}
                        icon={Users}
                      />
                    ),
                  },
                  {
                    key: "kpi-faltas",
                    titulo: "Total de faltas",
                    tamanho: "pequeno" as const,
                    conteudo: (
                      <KpiCard
                        label="Total de faltas"
                        value={String(stats.totalFaltas)}
                        hint="Soma de faltas nos registros filtrados"
                        icon={CalendarX2}
                        tone="destructive"
                      />
                    ),
                  },
                  {
                    key: "kpi-colaboradores",
                    titulo: "Colaboradores",
                    tamanho: "pequeno" as const,
                    conteudo: (
                      <KpiCard
                        label="Colaboradores"
                        value={String(stats.uniqueColaboradores)}
                        hint="Colaboradores únicos nos dados filtrados"
                        icon={UserCheck}
                        tone="accent"
                      />
                    ),
                  },
                  {
                    key: "kpi-absenteismo",
                    titulo: "Taxa de absenteísmo",
                    tamanho: "pequeno" as const,
                    conteudo: (
                      <KpiCard
                        label="Taxa de absenteísmo"
                        value={`${stats.absenteeismRate}%`}
                        hint="Faltas / registros × 100"
                        icon={TrendingDown}
                        tone={parseFloat(stats.absenteeismRate) > 5 ? "destructive" : "accent"}
                      />
                    ),
                  },
                  {
                    key: "kpi-media",
                    titulo: "Média por colaborador",
                    tamanho: "pequeno" as const,
                    conteudo: (
                      <KpiCard
                        label="Média por colaborador"
                        value={stats.mediaFaltasColaborador}
                        hint="Faltas por colaborador no período"
                        icon={AlertTriangle}
                        tone={
                          parseFloat(stats.mediaFaltasColaborador) > 3 ? "destructive" : "primary"
                        }
                      />
                    ),
                  },
                ]
              : []),
            ...(stats && stats.tipoData.length > 0
              ? [
                  {
                    key: "ausencias-tipo",
                    titulo: "Ausências por tipo",
                    tamanho: "grande" as const,
                    conteudo: (
                      <section className="space-y-3">
                        <h2 className="text-base font-semibold text-foreground">
                          Ausências por tipo
                        </h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {stats.tipoData.map((t, idx) => {
                            const color = CARD_COLORS[idx % CARD_COLORS.length]!;
                            const ativo = filterTipo === t.name;
                            return (
                              <button
                                key={t.name}
                                type="button"
                                onClick={() => setFilterTipo(ativo ? "" : t.name)}
                                className={`rounded-xl border ${color.border} ${color.bg} p-4 text-left transition-all hover:scale-[1.02] ${
                                  ativo ? "ring-2 ring-primary" : ""
                                }`}
                              >
                                <p
                                  className={`text-xs font-semibold uppercase tracking-wide ${color.text}`}
                                >
                                  {t.name}
                                </p>
                                <p className="mt-2 text-2xl font-bold text-foreground">
                                  {t.registros}
                                </p>
                                <p className="text-xs text-muted-foreground">registro(s)</p>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ),
                  },
                ]
              : []),
            ...(registrosSerieMensal.length > 1
              ? [
                  {
                    key: "evolucao-mensal",
                    titulo: "Evolução mensal de faltas",
                    tamanho: "grande" as const,
                    conteudo: (
                      <section className="rounded-xl border border-border bg-card p-5">
                        <h2 className="text-base font-semibold text-foreground">
                          Evolução mensal de faltas
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Total de faltas e registros por mês de início do período (gerentes
                          selecionados).
                        </p>
                        <div className="mt-4 h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={registrosSerieMensal} margin={{ left: 4, right: 16 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                              <XAxis
                                dataKey="label"
                                stroke="var(--color-muted-foreground)"
                                fontSize={11}
                              />
                              <YAxis
                                allowDecimals={false}
                                stroke="var(--color-muted-foreground)"
                                fontSize={11}
                              />
                              <Tooltip content={<ChartTooltipContent />} />
                              <Line
                                type="monotone"
                                dataKey="total"
                                name="Faltas"
                                stroke={paletteColor(0)}
                                strokeWidth={2}
                                dot
                              />
                              <Line
                                type="monotone"
                                dataKey="registros"
                                name="Registros"
                                stroke={paletteColor(2)}
                                strokeWidth={2}
                                dot
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                    ),
                  },
                ]
              : []),
            ...(stats && stats.cargoBarData.length > 0
              ? [
                  {
                    key: "faltas-cargo",
                    titulo: "Faltas por Cargo",
                    tamanho: "grande" as const,
                    conteudo: (
                      <section className="rounded-xl border border-border bg-card p-5">
                        <h2 className="text-base font-semibold text-foreground">
                          Faltas por Cargo
                        </h2>
                        <div className="mt-4 h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={stats.cargoBarData}
                              margin={{ left: 4, right: 16, bottom: 40 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                              <XAxis
                                dataKey="name"
                                stroke="var(--color-muted-foreground)"
                                fontSize={10}
                                angle={-30}
                                textAnchor="end"
                                interval={0}
                                height={60}
                              />
                              <YAxis
                                allowDecimals={false}
                                stroke="var(--color-muted-foreground)"
                                fontSize={11}
                              />
                              <Tooltip content={<ChartTooltipContent />} />
                              <Bar dataKey="faltas" name="Faltas" radius={4}>
                                {stats.cargoBarData.map((_, idx) => (
                                  <Cell key={idx} fill={paletteColor(idx + 3)} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                    ),
                  },
                ]
              : []),
            ...(stats && stats.barData.length > 0
              ? [
                  {
                    key: "graficos",
                    titulo: "Gráficos de faltas",
                    tamanho: "grande" as const,
                    conteudo: (
                      <section className="grid gap-6 lg:grid-cols-2">
                        {/* Top colaboradores */}
                        <div className="rounded-xl border border-border bg-card p-5">
                          <h2 className="text-base font-semibold text-foreground">
                            Top 10 — Faltas por Colaborador
                          </h2>
                          <div className="mt-4 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={stats.barData}
                                layout="vertical"
                                margin={{ left: 4, right: 16 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis
                                  type="number"
                                  allowDecimals={false}
                                  stroke="var(--color-muted-foreground)"
                                  fontSize={11}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="name"
                                  width={160}
                                  stroke="var(--color-muted-foreground)"
                                  fontSize={10}
                                />
                                <Tooltip content={<TopColaboradorTooltip />} />
                                <Bar dataKey="quantidade" name="Dias de falta" radius={4}>
                                  {stats.barData.map((_, idx) => (
                                    <Cell key={idx} fill={paletteColor(idx)} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Top postos */}
                        {stats.postoBarData.length > 0 && (
                          <div className="rounded-xl border border-border bg-card p-5">
                            <h2 className="text-base font-semibold text-foreground">
                              Top 7 — Faltas por Posto
                            </h2>
                            <div className="mt-4 h-72">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={stats.postoBarData}
                                  margin={{ left: 4, right: 16, bottom: 40 }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="var(--color-border)"
                                  />
                                  <XAxis
                                    dataKey="name"
                                    stroke="var(--color-muted-foreground)"
                                    fontSize={10}
                                    angle={-30}
                                    textAnchor="end"
                                    interval={0}
                                    height={60}
                                  />
                                  <YAxis
                                    allowDecimals={false}
                                    stroke="var(--color-muted-foreground)"
                                    fontSize={11}
                                  />
                                  <Tooltip content={<ChartTooltipContent />} />
                                  <Bar dataKey="faltas" name="Faltas" radius={4}>
                                    {stats.postoBarData.map((_, idx) => (
                                      <Cell key={idx} fill={paletteColor(idx)} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </section>
                    ),
                  },
                ]
              : []),
            ...(columnsDetected && filteredData.length > 0
              ? [
                  {
                    key: "tabela",
                    titulo: "Registros",
                    tamanho: "grande" as const,
                    conteudo: (
                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h2 className="text-base font-semibold text-foreground">Registros</h2>
                          <span className="text-xs text-muted-foreground">
                            {filteredData.length} registro(s)
                          </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-secondary text-left">
                                <th className="px-4 py-3 font-medium text-muted-foreground">
                                  Posto
                                </th>
                                <th className="px-4 py-3 font-medium text-muted-foreground">
                                  Colaborador
                                </th>
                                <th className="px-4 py-3 font-medium text-muted-foreground">
                                  Cargo
                                </th>
                                <th className="px-4 py-3 font-medium text-muted-foreground">
                                  Gerente
                                </th>
                                <th className="px-4 py-3 font-medium text-muted-foreground">
                                  Período
                                </th>
                                <th className="px-4 py-3 font-medium text-muted-foreground">
                                  Faltas
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredData.map((r, idx) => (
                                <tr
                                  key={idx}
                                  className="border-b border-border transition-colors hover:bg-muted/50"
                                >
                                  <td className="px-4 py-2 text-foreground">{r.posto || "—"}</td>
                                  <td className="px-4 py-2 text-foreground">
                                    {r.colaborador || "—"}
                                  </td>
                                  <td className="px-4 py-2 text-foreground">{r.cargo || "—"}</td>
                                  <td className="px-4 py-2 text-foreground">
                                    {(gerenteAreaACanonico(r.gerente) ?? r.gerente) || "—"}
                                  </td>
                                  <td className="px-4 py-2 text-foreground">{r.periodo || "—"}</td>
                                  <td className="px-4 py-2 text-foreground font-semibold">
                                    {r.faltas || "0"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </main>
  );
}
