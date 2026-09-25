import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coffee,
  Download,
  FileText,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  ROTULO_TIPO,
  carregarPonto,
  dataBr,
  dataHoraLocal,
  gerarChave,
  hojeLocal,
  horaLocal,
  lerPendentes,
  minutosParaTexto,
  proximaMarcacaoEsperada,
  salvarPendentes,
  type DadosPonto,
  type TipoMarcacao,
} from "@/lib/ponto";
import {
  decidirAjuste,
  editarMarcacoesDia,
  fecharPeriodo,
  meuPapelPonto,
  recalcularPeriodo,
  registrarMarcacao,
  solicitarAjuste,
} from "@/lib/ponto.functions";

export type ModoPonto =
  | "registro"
  | "espelho"
  | "ajustes"
  | "dashboard"
  | "funcionarios"
  | "empresas"
  | "escalas"
  | "banco"
  | "faltas"
  | "aprovacoes"
  | "fechamento"
  | "relatorios"
  | "configuracoes"
  | "auditoria";

const TITULOS: Record<ModoPonto, { titulo: string; descricao: string }> = {
  registro: { titulo: "Registro de ponto", descricao: "Marque entrada, intervalo e saída com horário do servidor." },
  espelho: { titulo: "Meu espelho de ponto", descricao: "Todas as suas marcações, horas e saldo do período." },
  ajustes: { titulo: "Solicitação de ajuste", descricao: "Peça a correção de uma marcação e acompanhe a resposta." },
  dashboard: { titulo: "Painel do ponto", descricao: "Presença do dia, atrasos, pendências e horas extras." },
  funcionarios: { titulo: "Funcionários", descricao: "Cadastro, empresa, posto, supervisor e escala." },
  empresas: { titulo: "Empresas e postos", descricao: "Empresas, unidades, endereço e área permitida." },
  escalas: { titulo: "Escalas e jornadas", descricao: "Jornadas, intervalos, tolerância e dias de trabalho." },
  banco: { titulo: "Banco de horas", descricao: "Saldo acumulado por funcionário." },
  faltas: { titulo: "Faltas e justificativas", descricao: "Registro e justificativa de ausências." },
  aprovacoes: { titulo: "Aprovações pendentes", descricao: "Pedidos de correção aguardando decisão." },
  fechamento: { titulo: "Fechamento mensal", descricao: "Períodos de apuração abertos e fechados." },
  relatorios: { titulo: "Relatórios", descricao: "Espelho, atrasos, faltas, horas extras e banco de horas." },
  configuracoes: { titulo: "Configurações", descricao: "Tolerância, localização, banco de horas e feriados." },
  auditoria: { titulo: "Histórico de auditoria", descricao: "Tudo que foi registrado, alterado e aprovado." },
};

export function PontoWorkspace({ modo }: { modo: ModoPonto }) {
  const cliente = useQueryClient();
  const carregarPapel = useServerFn(meuPapelPonto);

  const dados = useQuery({
    queryKey: ["ponto", "dados"],
    queryFn: carregarPonto,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const papel = useQuery({
    queryKey: ["ponto", "papel"],
    queryFn: () => carregarPapel(),
    staleTime: 5 * 60_000,
  });

  const recarregar = () => cliente.invalidateQueries({ queryKey: ["ponto"] });
  const info = TITULOS[modo];
  const gestor = papel.data?.papel === "rh" || papel.data?.papel === "admin";
  const supervisor = gestor || papel.data?.papel === "supervisor";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{info.titulo}</h1>
          <p className="text-sm text-muted-foreground">{info.descricao}</p>
        </div>
        <Button variant="outline" size="sm" onClick={recarregar} disabled={dados.isFetching}>
          <RefreshCw className={dados.isFetching ? "size-4 animate-spin" : "size-4"} />
          Atualizar
        </Button>
      </header>

      {dados.isLoading && <Aviso>Carregando informações do ponto...</Aviso>}
      {dados.isError && <Aviso tom="erro">Não foi possível carregar os dados. Tente atualizar.</Aviso>}

      {dados.data && (
        <>
          {modo === "registro" && (
            <Registro dados={dados.data} employeeId={papel.data?.employeeId ?? null} aoRegistrar={recarregar} />
          )}
          {modo === "espelho" && <Espelho dados={dados.data} employeeId={papel.data?.employeeId ?? null} gestor={supervisor} />}
          {modo === "ajustes" && <Ajustes dados={dados.data} employeeId={papel.data?.employeeId ?? null} aoSalvar={recarregar} />}
          {modo === "dashboard" && <Painel dados={dados.data} />}
          {modo === "funcionarios" && <Funcionarios dados={dados.data} gestor={gestor} aoSalvar={recarregar} />}
          {modo === "empresas" && <Empresas dados={dados.data} gestor={gestor} aoSalvar={recarregar} />}
          {modo === "escalas" && <Escalas dados={dados.data} gestor={gestor} aoSalvar={recarregar} />}
          {modo === "banco" && <BancoHorasSecao dados={dados.data} />}
          {modo === "faltas" && <Faltas dados={dados.data} gestor={gestor} aoSalvar={recarregar} />}
          {modo === "aprovacoes" && <Aprovacoes dados={dados.data} podeDecidir={supervisor} aoSalvar={recarregar} />}
          {modo === "fechamento" && <Fechamento dados={dados.data} gestor={gestor} aoSalvar={recarregar} />}
          {modo === "relatorios" && <Relatorios dados={dados.data} />}
          {modo === "configuracoes" && <Configuracoes dados={dados.data} gestor={gestor} aoSalvar={recarregar} />}
          {modo === "auditoria" && <AuditoriaSecao dados={dados.data} />}
        </>
      )}
    </div>
  );
}

/* ---------------------------------- base --------------------------------- */

function Aviso({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "erro" }) {
  return (
    <div
      className={
        tom === "erro"
          ? "rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          : "rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
      }
    >
      {children}
    </div>
  );
}

function Kpi({ titulo, valor, detalhe, icone: Icone }: { titulo: string; valor: string; detalhe?: string; icone: typeof Clock }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icone className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase text-muted-foreground">{titulo}</p>
          <p className="truncate font-display text-xl font-bold text-foreground">{valor}</p>
          {detalhe && <p className="truncate text-xs text-muted-foreground">{detalhe}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Tabela({ cabecalho, children }: { cabecalho: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            {cabecalho.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function Vazio({ colunas, texto }: { colunas: number; texto: string }) {
  return (
    <tr>
      <td colSpan={colunas} className="px-3 py-6 text-center text-sm text-muted-foreground">
        {texto}
      </td>
    </tr>
  );
}

/* -------------------------------- registro -------------------------------- */

function Registro({
  dados,
  employeeId,
  aoRegistrar,
}: {
  dados: DadosPonto;
  employeeId: string | null;
  aoRegistrar: () => void;
}) {
  const registrar = useServerFn(registrarMarcacao);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<TipoMarcacao | null>(null);
  const [local, setLocal] = useState<GeolocationCoordinates | null>(null);
  const [pendentes, setPendentes] = useState(() => (typeof window === "undefined" ? [] : lerPendentes()));

  const hoje = hojeLocal();
  const minhas = dados.marcacoes
    .filter((m) => m.employee_id === employeeId && m.data_ref === hoje && m.status !== "corrigido")
    .sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));
  const resumoHoje = dados.resumos.find((r) => r.employee_id === employeeId && r.data === hoje);
  const proxima = proximaMarcacaoEsperada(minhas.map((m) => m.tipo));

  const pedirLocal = () =>
    new Promise<GeolocationCoordinates | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocal(pos.coords);
          resolve(pos.coords);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });

  const enviar = useMutation({
    mutationFn: async (tipo: TipoMarcacao) => {
      const coords = local ?? (await pedirLocal());
      const chave = gerarChave();
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      if (!online) {
        const fila = [
          ...lerPendentes(),
          {
            idempotencyKey: chave,
            tipo,
            dispositivoEm: new Date().toISOString(),
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            precisao: coords?.accuracy ?? null,
          },
        ];
        salvarPendentes(fila);
        setPendentes(fila);
        return { offline: true as const };
      }
      return registrar({
        data: {
          tipo,
          idempotencyKey: chave,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          precisao: coords?.accuracy ?? null,
          dispositivoEm: new Date().toISOString(),
          origem: "online",
        },
      });
    },
    onSuccess: (r) => {
      setConfirmando(null);
      if ("offline" in r) {
        toast.info("Sem internet: a marcação foi guardada e será enviada quando a conexão voltar.");
        return;
      }
      setComprovante(r.comprovante);
      toast.success(
        r.status === "fora_area"
          ? `Registro feito fora da área do posto. Comprovante ${r.comprovante}.`
          : `Ponto registrado. Comprovante ${r.comprovante}.`,
      );
      aoRegistrar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sincronizar = useMutation({
    mutationFn: async () => {
      const fila = lerPendentes();
      const restantes: typeof fila = [];
      for (const item of fila) {
        try {
          await registrar({
            data: {
              tipo: item.tipo,
              idempotencyKey: item.idempotencyKey,
              latitude: item.latitude,
              longitude: item.longitude,
              precisao: item.precisao,
              dispositivoEm: item.dispositivoEm,
              origem: "offline",
            },
          });
        } catch {
          restantes.push(item);
        }
      }
      salvarPendentes(restantes);
      setPendentes(restantes);
      return restantes.length;
    },
    onSuccess: (restantes) => {
      toast.success(restantes === 0 ? "Marcações enviadas." : `${restantes} marcação(ões) continuam pendentes.`);
      aoRegistrar();
    },
  });

  if (!employeeId) {
    return <Aviso tom="erro">Seu acesso ainda não está vinculado a um funcionário do ponto. Peça ao RH para fazer o vínculo na página Funcionários.</Aviso>;
  }

  const botoes: { tipo: TipoMarcacao; icone: typeof LogIn }[] = [
    { tipo: "entrada", icone: LogIn },
    { tipo: "intervalo_inicio", icone: Coffee },
    { tipo: "intervalo_fim", icone: AlarmClock },
    { tipo: "saida", icone: LogOut },
    { tipo: "saida_extraordinaria", icone: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Último registro" valor={minhas.at(-1) ? horaLocal(minhas.at(-1)!.registrado_em) : "--:--"} detalhe={minhas.at(-1) ? ROTULO_TIPO[minhas.at(-1)!.tipo] : "Nenhum hoje"} icone={Clock} />
        <Kpi titulo="Próximo registro" valor={ROTULO_TIPO[proxima]} icone={CalendarClock} />
        <Kpi titulo="Horas de hoje" valor={minutosParaTexto(resumoHoje?.trabalhado_min ?? 0)} detalhe={`Previsto ${minutosParaTexto(resumoHoje?.previsto_min ?? 0)}`} icone={AlarmClock} />
        <Kpi titulo="Saldo do dia" valor={minutosParaTexto(resumoHoje?.saldo_min ?? 0)} icone={ShieldCheck} />
      </div>

      {pendentes.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <WifiOff className="size-4" /> {pendentes.length} marcação(ões) guardada(s) sem internet.
          </p>
          <Button size="sm" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
            <Wifi className="size-4" /> Enviar agora
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registrar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {botoes.map(({ tipo, icone: Icone }) => (
              <Button
                key={tipo}
                size="lg"
                variant={tipo === proxima ? "default" : "outline"}
                className="h-16 justify-start text-base"
                onClick={async () => {
                  await pedirLocal();
                  setConfirmando(tipo);
                }}
              >
                <Icone className="size-5" />
                {ROTULO_TIPO[tipo]}
              </Button>
            ))}
          </div>

          {confirmando && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
              <p className="font-medium text-foreground">Confirme antes de registrar</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Tipo: {ROTULO_TIPO[confirmando]}</li>
                <li>Data e hora: {dataHoraLocal(new Date().toISOString())}</li>
                <li className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {local ? `${local.latitude.toFixed(5)}, ${local.longitude.toFixed(5)} (±${Math.round(local.accuracy)} m)` : "Localização não disponível"}
                </li>
              </ul>
              <div className="flex gap-2">
                <Button onClick={() => enviar.mutate(confirmando)} disabled={enviar.isPending}>
                  Confirmar registro
                </Button>
                <Button variant="outline" onClick={() => setConfirmando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {comprovante && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
              <CheckCircle2 className="size-4 text-primary" /> Comprovante: <strong>{comprovante}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marcações de hoje</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabela cabecalho={["Hora", "Tipo", "Origem", "Situação", "Comprovante"]}>
            {minhas.length === 0 && <Vazio colunas={5} texto="Nenhuma marcação hoje." />}
            {minhas.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2">{horaLocal(m.registrado_em)}</td>
                <td className="px-3 py-2">{ROTULO_TIPO[m.tipo]}</td>
                <td className="px-3 py-2">{m.origem}</td>
                <td className="px-3 py-2">{m.status}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.comprovante}</td>
              </tr>
            ))}
          </Tabela>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- espelho -------------------------------- */

type ModeloPdf = "completo" | "simplificado" | "conferencia";

const MODELOS_PDF: { id: ModeloPdf; nome: string; colunas: string; descricao: string }[] = [
  {
    id: "completo",
    nome: "Espelho completo",
    colunas: "Data · Marcações · Trabalhado · Previsto · Atraso · Extra · Saldo · Situação",
    descricao: "Todas as colunas do espelho, com linha de totais e campos de assinatura do funcionário e do responsável.",
  },
  {
    id: "simplificado",
    nome: "Espelho simplificado",
    colunas: "Data · Marcações · Trabalhado · Saldo",
    descricao: "Versão enxuta para conferência rápida, com linha de totais e campos de assinatura.",
  },
  {
    id: "conferencia",
    nome: "Ficha de conferência",
    colunas: "Data · Marcações · Assinatura do dia",
    descricao: "Uma linha por dia com espaço para o funcionário conferir e assinar as marcações daquele dia.",
  },
];

function Espelho({ dados, employeeId, gestor }: { dados: DadosPonto; employeeId: string | null; gestor: boolean }) {
  const [funcionario, setFuncionario] = useState<string>(employeeId ?? "");
  const [mes, setMes] = useState(() => hojeLocal().slice(0, 7));
  const [modelosAberto, setModelosAberto] = useState(false);
  const alvo = gestor ? funcionario || employeeId || "" : employeeId ?? "";

  const resumos = dados.resumos.filter((r) => r.employee_id === alvo && r.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data));
  const marcacoes = dados.marcacoes.filter((m) => m.employee_id === alvo && m.data_ref.startsWith(mes));
  const totais = resumos.reduce(
    (acc, r) => ({
      trabalhado: acc.trabalhado + r.trabalhado_min,
      previsto: acc.previsto + r.previsto_min,
      atraso: acc.atraso + r.atraso_min,
      extra: acc.extra + r.extra_min,
      saldo: acc.saldo + r.saldo_min,
    }),
    { trabalhado: 0, previsto: 0, atraso: 0, extra: 0, saldo: 0 },
  );

  const cliente = useQueryClient();
  const editar = useServerFn(editarMarcacoesDia);
  const [diaNovo, setDiaNovo] = useState("");
  const [edicao, setEdicao] = useState<{ data: string; linhas: { tipo: TipoMarcacao; horario: string }[]; motivo: string } | null>(null);
  const abrirEdicao = (dia: string) => {
    const linhas = dados.marcacoes
      .filter((m) => m.employee_id === alvo && m.data_ref === dia && m.status !== "corrigido")
      .sort((a, b) => a.registrado_em.localeCompare(b.registrado_em))
      .map((m) => ({ tipo: m.tipo as TipoMarcacao, horario: horaLocal(m.registrado_em).slice(0, 5) }));
    setEdicao({ data: dia, linhas, motivo: "" });
  };
  const atualizarLinha = (i: number, parcial: Partial<{ tipo: TipoMarcacao; horario: string }>) =>
    setEdicao((e) => (e ? { ...e, linhas: e.linhas.map((l, j) => (j === i ? { ...l, ...parcial } : l)) } : e));
  const salvarEdicao = useMutation({
    mutationFn: () => {
      if (!edicao) throw new Error("Nada para salvar.");
      return editar({ data: { employeeId: alvo, dataRef: edicao.data, marcacoes: edicao.linhas, motivo: edicao.motivo } });
    },
    onSuccess: () => {
      toast.success("Folha atualizada.");
      setEdicao(null);
      void cliente.invalidateQueries({ queryKey: ["ponto"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linhasDoDia = (dia: string) =>
    dados.marcacoes
      .filter((m) => m.employee_id === alvo && m.data_ref === dia && m.status !== "corrigido")
      .sort((a, b) => a.registrado_em.localeCompare(b.registrado_em))
      .map((m) => ({ tipo: m.tipo as TipoMarcacao, horario: horaLocal(m.registrado_em).slice(0, 5) }));

  const [remocao, setRemocao] = useState<{ data: string; index: number; linha: { tipo: TipoMarcacao; horario: string }; motivo: string } | null>(null);
  const removerUma = useMutation({
    mutationFn: () => {
      if (!remocao) throw new Error("Nada para remover.");
      if (!remocao.motivo.trim()) throw new Error("Descreva o motivo da remoção.");
      const restantes = linhasDoDia(remocao.data);
      restantes.splice(remocao.index, 1);
      return editar({ data: { employeeId: alvo, dataRef: remocao.data, marcacoes: restantes, motivo: remocao.motivo } });
    },
    onSuccess: () => {
      toast.success("Marcação removida.");
      setRemocao(null);
      void cliente.invalidateQueries({ queryKey: ["ponto"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const exportarPdf = async (modelo: ModeloPdf) => {
    const [{ jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    const nome = dados.funcionarios.find((f) => f.id === alvo)?.nome ?? "Funcionário";
    doc.setFontSize(14);
    doc.text(`${modelo === "conferencia" ? "Ficha de conferência de ponto" : "Espelho de ponto"} — ${nome}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${mes}`, 14, 23);

    const body = resumos.map((r) => {
      const marcacoesDia = marcacoes
        .filter((m) => m.data_ref === r.data && m.status !== "corrigido")
        .sort((a, b) => a.registrado_em.localeCompare(b.registrado_em))
        .map((m) => horaLocal(m.registrado_em))
        .join("  ");
      const base = [dataBr(r.data), marcacoesDia];
      if (modelo === "completo") {
        return [...base, minutosParaTexto(r.trabalhado_min), minutosParaTexto(r.previsto_min), minutosParaTexto(r.atraso_min), r.extra_min > 0 ? minutosParaTexto(r.extra_min) : "-", minutosParaTexto(r.saldo_min), r.situacao];
      }
      if (modelo === "simplificado") {
        return [...base, minutosParaTexto(r.trabalhado_min), minutosParaTexto(r.saldo_min)];
      }
      return [...base, ""];
    });

    const head = modelo === "completo"
      ? [["Data", "Marcações", "Trabalhado", "Previsto", "Atraso", "Extra", "Saldo", "Situação"]]
      : modelo === "simplificado"
        ? [["Data", "Marcações", "Trabalhado", "Saldo"]]
        : [["Data", "Marcações", "Conferido por (assinatura)"]];

    const totaisLinha = modelo === "completo"
      ? [["Totais", "", minutosParaTexto(totais.trabalhado), minutosParaTexto(totais.previsto), minutosParaTexto(totais.atraso), minutosParaTexto(totais.extra), minutosParaTexto(totais.saldo), ""]]
      : modelo === "simplificado"
        ? [["Totais", "", minutosParaTexto(totais.trabalhado), minutosParaTexto(totais.saldo)]]
        : undefined;

    autoTable.default(doc, {
      startY: 28,
      head,
      body: totaisLinha ? [...body, ...totaisLinha] : body,
      styles: { fontSize: modelo === "completo" ? 8 : 9 },
    });
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    if (modelo !== "conferencia") {
      const y = finalY + 20;
      doc.text("_______________________________", 14, y);
      doc.text("Assinatura do funcionário", 14, y + 5);
      doc.text("_______________________________", 120, y);
      doc.text("Assinatura do responsável", 120, y + 5);
    } else {
      doc.setFontSize(8);
      doc.text("Eu declaro que conferi as marcações acima e que correspondem ao efetivamente trabalhado.", 14, finalY + 12);
      doc.setFontSize(10);
      const y = finalY + 28;
      doc.text("_______________________________", 14, y);
      doc.text("Assinatura do funcionário", 14, y + 5);
    }
    doc.save(modelo === "conferencia" ? `ficha-conferencia-${mes}.pdf` : `espelho-${modelo}-${mes}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        {gestor && (
          <div className="min-w-56">
            <Label>Funcionário</Label>
            <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={funcionario} onChange={(e) => setFuncionario(e.target.value)}>
              <option value="">Selecione</option>
              {dados.funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label>Mês</Label>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setModelosAberto(true)} disabled={resumos.length === 0}>
          <Download className="size-4" /> Espelho em PDF
        </Button>
      </div>

      <Dialog open={modelosAberto} onOpenChange={setModelosAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modelos do PDF</DialogTitle>
            <DialogDescription>Escolha o modelo do espelho que será gerado para {mes}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODELOS_PDF.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setModelosAberto(false);
                  void exportarPdf(m.id);
                }}
                className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:shadow-md"
              >
                <FileText className="size-5 text-primary" />
                <span className="text-sm font-semibold">{m.nome}</span>
                <span className="rounded border border-border bg-muted/50 px-2 py-1 font-mono text-[10px] leading-snug text-muted-foreground">{m.colunas}</span>
                <span className="text-xs text-muted-foreground">{m.descricao}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Horas trabalhadas" valor={minutosParaTexto(totais.trabalhado)} icone={Clock} />
        <Kpi titulo="Horas previstas" valor={minutosParaTexto(totais.previsto)} icone={CalendarClock} />
        <Kpi titulo="Horas extras" valor={minutosParaTexto(totais.extra)} icone={AlarmClock} />
        <Kpi titulo="Saldo do período" valor={minutosParaTexto(totais.saldo)} icone={ShieldCheck} />
      </div>

      {gestor && alvo && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Editar outro dia</Label>
            <Input type="date" value={diaNovo} onChange={(e) => setDiaNovo(e.target.value)} />
          </div>
          <Button variant="outline" disabled={!diaNovo} onClick={() => abrirEdicao(diaNovo)}>
            <Pencil className="size-4" /> Editar marcações
          </Button>
        </div>
      )}

      <Tabela cabecalho={["Data", "Marcações", "Trabalhado", "Previsto", "Atraso", "Extra", "Saldo", "Situação", ...(gestor ? [""] : [])]}>
        {resumos.length === 0 && <Vazio colunas={gestor ? 9 : 8} texto="Nenhum dia apurado neste mês." />}
        {resumos.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2">{dataBr(r.data)}</td>
            <td className="px-3 py-2 font-mono text-xs">
              {linhasDoDia(r.data).map((l, i) => (
                <span key={i} className="mr-1 inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5">
                  {l.horario}
                  {gestor && (
                    <button
                      type="button"
                      aria-label={`Remover marcação ${l.horario}`}
                      title="Remover esta marcação"
                      className="text-muted-foreground transition hover:text-destructive"
                      onClick={() => setRemocao({ data: r.data, index: i, linha: l, motivo: "" })}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}
            </td>
            <td className="px-3 py-2">{minutosParaTexto(r.trabalhado_min)}</td>
            <td className="px-3 py-2">{minutosParaTexto(r.previsto_min)}</td>
            <td className="px-3 py-2">{minutosParaTexto(r.atraso_min)}</td>
            <td className={`px-3 py-2 ${r.extra_min > 0 ? "font-semibold text-primary" : "text-muted-foreground"}`}>{r.extra_min > 0 ? minutosParaTexto(r.extra_min) : "—"}</td>
            <td className={r.saldo_min < 0 ? "px-3 py-2 text-destructive" : "px-3 py-2"}>{minutosParaTexto(r.saldo_min)}</td>
            <td className="px-3 py-2">{r.situacao}</td>
            {gestor && (
              <td className="px-3 py-2">
                <Button size="sm" variant="ghost" onClick={() => abrirEdicao(r.data)}>
                  <Pencil className="size-4" /> Editar
                </Button>
              </td>
            )}
          </tr>
        ))}
      </Tabela>

      <Dialog open={!!edicao} onOpenChange={(v) => !v && setEdicao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar marcações — {edicao ? dataBr(edicao.data) : ""}</DialogTitle>
            <DialogDescription>Ajuste, remova ou inclua marcações. Os registros originais ficam guardados no histórico.</DialogDescription>
          </DialogHeader>
          {edicao && (
            <div className="space-y-3">
              {edicao.linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma marcação neste dia.</p>}
              {edicao.linhas.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                    value={l.tipo}
                    onChange={(e) => atualizarLinha(i, { tipo: e.target.value as TipoMarcacao })}
                  >
                    {(Object.keys(ROTULO_TIPO) as TipoMarcacao[]).map((t) => (
                      <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                    ))}
                  </select>
                  <Input type="time" className="w-32" value={l.horario} onChange={(e) => atualizarLinha(i, { horario: e.target.value })} />
                  <Button size="icon" variant="ghost" aria-label="Remover marcação" onClick={() => setEdicao({ ...edicao, linhas: edicao.linhas.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEdicao({ ...edicao, linhas: [...edicao.linhas, { tipo: "entrada", horario: "08:00" }] })}>
                  <Plus className="size-4" /> Adicionar marcação
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEdicao({ ...edicao, linhas: [...edicao.linhas].sort((a, b) => a.horario.localeCompare(b.horario)) })}>
                  Organizar por horário
                </Button>
                {edicao.linhas.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm("Remover todas as marcações deste dia? As originais ficam guardadas no histórico.")) {
                        setEdicao({ ...edicao, linhas: [] });
                      }
                    }}
                  >
                    <Trash2 className="size-4" /> Remover todas
                  </Button>
                )}
              </div>
              {(() => {
                const ordenadas = [...edicao.linhas].filter((l) => /^\d{2}:\d{2}$/.test(l.horario)).sort((a, b) => a.horario.localeCompare(b.horario));
                const paraMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
                let trab = 0;
                let inicio: number | null = null;
                for (const l of ordenadas) {
                  const t = paraMin(l.horario);
                  if (l.tipo === "entrada" || l.tipo === "intervalo_fim") inicio = t;
                  else if (inicio !== null) {
                    trab += Math.max(0, t - inicio);
                    inicio = null;
                  }
                }
                const previsto = resumos.find((r) => r.data === edicao.data)?.previsto_min ?? 0;
                const extra = previsto > 0 ? Math.max(0, trab - previsto) : 0;
                const atraso = previsto > 0 ? Math.max(0, previsto - trab) : 0;
                const saldo = previsto > 0 ? trab - previsto : 0;
                const itens: [string, string, string?][] = [
                  ["Trabalhado", minutosParaTexto(trab)],
                  ["Previsto", minutosParaTexto(previsto)],
                  ["Atraso", minutosParaTexto(atraso)],
                  ["Extra", extra > 0 ? minutosParaTexto(extra) : "—", extra > 0 ? "text-primary font-semibold" : ""],
                  ["Saldo", minutosParaTexto(saldo), saldo < 0 ? "text-destructive" : ""],
                ];
                return (
                  <div className="grid grid-cols-5 gap-2 rounded-md border border-border bg-muted/40 p-2 text-center">
                    {itens.map(([rot, val, cls]) => (
                      <div key={rot}>
                        <div className="text-[10px] uppercase text-muted-foreground">{rot}</div>
                        <div className={`text-sm ${cls ?? ""}`}>{val}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div>
                <Label>Motivo da correção</Label>
                <Textarea value={edicao.motivo} onChange={(e) => setEdicao({ ...edicao, motivo: e.target.value })} placeholder="Ex.: funcionário esqueceu de marcar a saída do intervalo" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEdicao(null)}>Cancelar</Button>
                <Button disabled={salvarEdicao.isPending || !edicao.motivo.trim()} onClick={() => salvarEdicao.mutate()}>
                  {salvarEdicao.isPending ? "Salvando..." : "Salvar folha"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!remocao} onOpenChange={(v) => !v && setRemocao(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover marcação — {remocao ? `${dataBr(remocao.data)} · ${remocao.linha.horario}` : ""}</DialogTitle>
            <DialogDescription>
              {remocao ? `${ROTULO_TIPO[remocao.linha.tipo]} será retirada da folha. O registro original fica guardado no histórico e na auditoria.` : ""}
            </DialogDescription>
          </DialogHeader>
          {remocao && (
            <div className="space-y-3">
              <div>
                <Label>Motivo da remoção</Label>
                <Textarea value={remocao.motivo} onChange={(e) => setRemocao({ ...remocao, motivo: e.target.value })} placeholder="Ex.: marcação registrada no horário errado" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRemocao(null)}>Cancelar</Button>
                <Button variant="destructive" disabled={removerUma.isPending || !remocao.motivo.trim()} onClick={() => removerUma.mutate()}>
                  {removerUma.isPending ? "Removendo..." : "Remover marcação"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------------- ajustes -------------------------------- */

function Ajustes({ dados, employeeId, aoSalvar }: { dados: DadosPonto; employeeId: string | null; aoSalvar: () => void }) {
  const pedir = useServerFn(solicitarAjuste);
  const [dataRef, setDataRef] = useState(hojeLocal());
  const [tipo, setTipo] = useState<TipoMarcacao>("entrada");
  const [horario, setHorario] = useState("08:00");
  const [motivo, setMotivo] = useState("");

  const enviar = useMutation({
    mutationFn: () => pedir({ data: { dataRef, tipo, horario, motivo } }),
    onSuccess: () => {
      toast.success("Pedido de correção enviado.");
      setMotivo("");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meus = dados.pedidos.filter((p) => p.employee_id === employeeId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novo pedido de correção</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Data</Label>
            <Input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} />
          </div>
          <div>
            <Label>Tipo de marcação</Label>
            <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMarcacao)}>
              {Object.entries(ROTULO_TIPO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Horário correto</Label>
            <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique o que aconteceu" />
          </div>
          <div>
            <Button onClick={() => enviar.mutate()} disabled={enviar.isPending || !motivo.trim()}>
              Enviar pedido
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabela cabecalho={["Enviado em", "Data", "Tipo", "Horário", "Situação", "Resposta"]}>
        {meus.length === 0 && <Vazio colunas={6} texto="Nenhum pedido enviado." />}
        {meus.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2">{dataHoraLocal(p.created_at)}</td>
            <td className="px-3 py-2">{dataBr(p.data_ref)}</td>
            <td className="px-3 py-2">{ROTULO_TIPO[p.tipo]}</td>
            <td className="px-3 py-2">{horaLocal(p.horario_correto)}</td>
            <td className="px-3 py-2">{p.status}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.justificativa_decisao ?? "—"}</td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

/* --------------------------------- painel --------------------------------- */

function Painel({ dados }: { dados: DadosPonto }) {
  const [empresa, setEmpresa] = useState("");
  const [posto, setPosto] = useState("");
  const [postoAberto, setPostoAberto] = useState<string | null>(null);
  const [folhaAberta, setFolhaAberta] = useState<string | null>(null);
  const hoje = hojeLocal();

  const funcionarios = dados.funcionarios.filter(
    (f) =>
      f.ativo &&
      (!empresa || f.company_id === empresa) &&
      (!posto || (posto === "__sem" ? !f.unit_id : f.unit_id === posto)),
  );
  const ids = new Set(funcionarios.map((f) => f.id));
  const doDia = dados.marcacoes.filter((m) => m.data_ref === hoje && ids.has(m.employee_id));
  const resumos = dados.resumos.filter((r) => r.data === hoje && ids.has(r.employee_id));

  const presentes = new Set(doDia.filter((m) => m.tipo === "entrada").map((m) => m.employee_id));
  const emIntervalo = new Set(
    [...presentes].filter((id) => {
      const ult = doDia.filter((m) => m.employee_id === id).sort((a, b) => a.registrado_em.localeCompare(b.registrado_em)).at(-1);
      return ult?.tipo === "intervalo_inicio";
    }),
  );
  const atrasados = resumos.filter((r) => r.atraso_min > 0).length;
  const incompletos = resumos.filter((r) => r.situacao === "incompleto").length;
  const pendentes = dados.pedidos.filter((p) => p.status === "pendente").length;
  const extras = resumos.reduce((s, r) => s + r.extra_min, 0);
  const saldoBanco = dados.banco.filter((b) => ids.has(b.employee_id)).reduce((s, b) => s + b.minutos, 0);

  const unidadesVisiveis = dados.unidades.filter((u) => !empresa || (u as { company_id?: string | null }).company_id === empresa || funcionarios.some((f) => f.unit_id === u.id));
  const grupos = [
    ...unidadesVisiveis.map((u) => ({ id: u.id, nome: u.nome, pessoas: funcionarios.filter((f) => f.unit_id === u.id) })),
    { id: "__sem", nome: "Sem posto definido", pessoas: funcionarios.filter((f) => !f.unit_id) },
  ].filter((g) => (posto ? g.id === posto : g.pessoas.length > 0 || g.id !== "__sem"));

  const grupoAberto = postoAberto ? grupos.find((g) => g.id === postoAberto) ?? null : null;

  if (grupoAberto) {
    const funcionarioFolha = folhaAberta ? dados.funcionarios.find((f) => f.id === folhaAberta) ?? null : null;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (folhaAberta ? setFolhaAberta(null) : setPostoAberto(null))}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {folhaAberta ? `Voltar para ${grupoAberto.nome}` : "Voltar ao painel"}
          </Button>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <MapPin className="h-4 w-4 text-primary" />
            {grupoAberto.nome}
            {funcionarioFolha ? <span className="text-muted-foreground">/ {funcionarioFolha.nome}</span> : null}
          </h3>
        </div>

        {funcionarioFolha ? (
          <Espelho key={funcionarioFolha.id} dados={dados} employeeId={funcionarioFolha.id} gestor />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Funcionários lotados ({grupoAberto.pessoas.filter((p) => presentes.has(p.id)).length}/{grupoAberto.pessoas.length} presentes hoje)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {grupoAberto.pessoas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguém lotado neste posto.</p>
              ) : (
                <ul className="divide-y divide-border/60 text-sm">
                  {grupoAberto.pessoas
                    .slice()
                    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                    .map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${presentes.has(p.id) ? "bg-primary" : "bg-muted-foreground/40"}`}
                            title={presentes.has(p.id) ? "Presente hoje" : "Sem entrada hoje"}
                          />
                          <span className="truncate">
                            {p.nome}
                            {p.cargo ? <span className="text-muted-foreground"> · {p.cargo}</span> : null}
                          </span>
                        </span>
                        <Button variant="outline" size="sm" onClick={() => setFolhaAberta(p.id)}>
                          <FileText className="mr-1 h-4 w-4" />
                          Folha de ponto
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <div>
          <Label>Empresa</Label>
          <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            <option value="">Todas</option>
            {dados.empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Posto</Label>
          <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={posto} onChange={(e) => setPosto(e.target.value)}>
            <option value="">Todos</option>
            {dados.unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
            <option value="__sem">Sem posto definido</option>
          </select>
        </div>
      </div>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Funcionários ativos" valor={String(funcionarios.length)} icone={ShieldCheck} />
        <Kpi titulo="Presentes hoje" valor={String(presentes.size)} detalhe={`${emIntervalo.size} em intervalo`} icone={CheckCircle2} />
        <Kpi titulo="Ausentes" valor={String(Math.max(0, funcionarios.length - presentes.size))} icone={LogOut} />
        <Kpi titulo="Atrasados" valor={String(atrasados)} icone={AlarmClock} />
        <Kpi titulo="Pontos incompletos" valor={String(incompletos)} icone={Clock} />
        <Kpi titulo="Solicitações pendentes" valor={String(pendentes)} icone={CalendarClock} />
        <Kpi titulo="Horas extras hoje" valor={minutosParaTexto(extras)} icone={AlarmClock} />
        <Kpi titulo="Saldo do banco de horas" valor={minutosParaTexto(saldoBanco)} icone={ShieldCheck} />
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold">Lotação por posto</h3>
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum posto cadastrado.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grupos.map((g) => {
               const presentesPosto = g.pessoas.filter((p) => presentes.has(p.id)).length;
               return (
                 <Card
                   key={g.id}
                   className="cursor-pointer"
                   onClick={() => {
                     setPostoAberto(g.id);
                     setFolhaAberta(null);
                   }}
                 >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-start justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {g.nome}
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {presentesPosto}/{g.pessoas.length} presentes
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {g.pessoas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Ninguém lotado neste posto.</p>
                    ) : (
                      <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                        {g.pessoas
                          .slice()
                          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                          .map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1 last:border-0">
                              <span className="truncate">
                                {p.nome}
                                {p.cargo ? <span className="text-muted-foreground"> · {p.cargo}</span> : null}
                              </span>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${presentes.has(p.id) ? "bg-primary" : "bg-muted-foreground/40"}`} title={presentes.has(p.id) ? "Presente hoje" : "Sem entrada hoje"} />
                            </li>
                          ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card>

        <CardHeader>
          <CardTitle>Movimento de hoje</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabela cabecalho={["Hora", "Funcionário", "Tipo", "Situação", "Distância"]}>
            {doDia.length === 0 && <Vazio colunas={5} texto="Nenhuma marcação hoje." />}
            {doDia
              .sort((a, b) => b.registrado_em.localeCompare(a.registrado_em))
              .slice(0, 60)
              .map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">{horaLocal(m.registrado_em)}</td>
                  <td className="px-3 py-2">{dados.funcionarios.find((f) => f.id === m.employee_id)?.nome ?? "—"}</td>
                  <td className="px-3 py-2">{ROTULO_TIPO[m.tipo]}</td>
                  <td className="px-3 py-2">{m.status}</td>
                  <td className="px-3 py-2">{m.distancia_m != null ? `${Math.round(m.distancia_m)} m` : "—"}</td>
                </tr>
              ))}
          </Tabela>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ funcionários ------------------------------ */

function Funcionarios({ dados, gestor, aoSalvar }: { dados: DadosPonto; gestor: boolean; aoSalvar: () => void }) {
  const [form, setForm] = useState({ nome: "", matricula: "", cargo: "", company_id: "", unit_id: "", user_id: "", supervisor_user_id: "" });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      const { error } = await supabase.from("pnt_employees").insert({
        organization_id: dados.organizationId,
        nome: form.nome.trim(),
        matricula: form.matricula || null,
        cargo: form.cargo || null,
        company_id: form.company_id || null,
        unit_id: form.unit_id || null,
        user_id: form.user_id || null,
        supervisor_user_id: form.supervisor_user_id || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Funcionário cadastrado.");
      setForm({ nome: "", matricula: "", cargo: "", company_id: "", unit_id: "", user_id: "", supervisor_user_id: "" });
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("pnt_employees").update({ ativo }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: aoSalvar,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {gestor && (
        <Card>
          <CardHeader>
            <CardTitle>Novo funcionário</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Matrícula</Label>
              <Input value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            </div>
            <div>
              <Label>Empresa</Label>
              <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Selecione</option>
                {dados.empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Posto / unidade</Label>
              <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
                <option value="">Selecione</option>
                {dados.unidades.filter((u) => !form.company_id || u.company_id === form.company_id).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Código do acesso (usuário)</Label>
              <Input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="Opcional" />
            </div>
            <div>
              <Label>Código do supervisor</Label>
              <Input value={form.supervisor_user_id} onChange={(e) => setForm({ ...form, supervisor_user_id: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="flex items-end">
              <Button onClick={() => salvar.mutate()} disabled={!form.nome.trim() || salvar.isPending}>
                Cadastrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabela cabecalho={["Nome", "Matrícula", "Cargo", "Empresa", "Posto", "Situação", ""]}>
        {dados.funcionarios.length === 0 && <Vazio colunas={7} texto="Nenhum funcionário cadastrado." />}
        {dados.funcionarios.map((f) => (
          <tr key={f.id}>
            <td className="px-3 py-2">{f.nome}</td>
            <td className="px-3 py-2">{f.matricula ?? "—"}</td>
            <td className="px-3 py-2">{f.cargo ?? "—"}</td>
            <td className="px-3 py-2">{dados.empresas.find((e) => e.id === f.company_id)?.nome ?? "—"}</td>
            <td className="px-3 py-2">{dados.unidades.find((u) => u.id === f.unit_id)?.nome ?? "—"}</td>
            <td className="px-3 py-2">{f.ativo ? "Ativo" : "Inativo"}</td>
            <td className="px-3 py-2 text-right">
              {gestor && (
                <Button size="sm" variant="outline" onClick={() => alternarAtivo.mutate({ id: f.id, ativo: !f.ativo })}>
                  {f.ativo ? "Inativar" : "Ativar"}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

/* -------------------------------- empresas -------------------------------- */

function Empresas({ dados, gestor, aoSalvar }: { dados: DadosPonto; gestor: boolean; aoSalvar: () => void }) {
  const [empresa, setEmpresa] = useState({ nome: "", cnpj: "", tolerancia_min: 5 });
  const [unidade, setUnidade] = useState({ nome: "", company_id: "", endereco: "", latitude: "", longitude: "", raio_metros: 200 });

  const criarEmpresa = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      const { error } = await supabase.from("pnt_companies").insert({
        organization_id: dados.organizationId,
        nome: empresa.nome.trim(),
        cnpj: empresa.cnpj || null,
        tolerancia_min: Number(empresa.tolerancia_min) || 5,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Empresa cadastrada.");
      setEmpresa({ nome: "", cnpj: "", tolerancia_min: 5 });
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarUnidade = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      if (!unidade.company_id) throw new Error("Escolha a empresa.");
      const { error } = await supabase.from("pnt_units").insert({
        organization_id: dados.organizationId,
        company_id: unidade.company_id,
        nome: unidade.nome.trim(),
        endereco: unidade.endereco || null,
        latitude: unidade.latitude ? Number(unidade.latitude) : null,
        longitude: unidade.longitude ? Number(unidade.longitude) : null,
        raio_metros: Number(unidade.raio_metros) || 200,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Posto cadastrado.");
      setUnidade({ nome: "", company_id: "", endereco: "", latitude: "", longitude: "", raio_metros: 200 });
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {gestor && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nova empresa</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input value={empresa.nome} onChange={(e) => setEmpresa({ ...empresa, nome: e.target.value })} />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={empresa.cnpj} onChange={(e) => setEmpresa({ ...empresa, cnpj: e.target.value })} />
              </div>
              <div>
                <Label>Tolerância (minutos)</Label>
                <Input type="number" value={empresa.tolerancia_min} onChange={(e) => setEmpresa({ ...empresa, tolerancia_min: Number(e.target.value) })} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => criarEmpresa.mutate()} disabled={!empresa.nome.trim()}>
                  Cadastrar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Novo posto / unidade</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Empresa</Label>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={unidade.company_id} onChange={(e) => setUnidade({ ...unidade, company_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {dados.empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Nome do posto</Label>
                <Input value={unidade.nome} onChange={(e) => setUnidade({ ...unidade, nome: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Endereço</Label>
                <Input value={unidade.endereco} onChange={(e) => setUnidade({ ...unidade, endereco: e.target.value })} />
              </div>
              <div>
                <Label>Latitude</Label>
                <Input value={unidade.latitude} onChange={(e) => setUnidade({ ...unidade, latitude: e.target.value })} />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input value={unidade.longitude} onChange={(e) => setUnidade({ ...unidade, longitude: e.target.value })} />
              </div>
              <div>
                <Label>Área permitida (metros)</Label>
                <Input type="number" value={unidade.raio_metros} onChange={(e) => setUnidade({ ...unidade, raio_metros: Number(e.target.value) })} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => criarUnidade.mutate()} disabled={!unidade.nome.trim()}>
                  Cadastrar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabela cabecalho={["Posto", "Empresa", "Endereço", "Área permitida"]}>
        {dados.unidades.length === 0 && <Vazio colunas={4} texto="Nenhum posto cadastrado." />}
        {dados.unidades.map((u) => (
          <tr key={u.id}>
            <td className="px-3 py-2">{u.nome}</td>
            <td className="px-3 py-2">{dados.empresas.find((e) => e.id === u.company_id)?.nome ?? "—"}</td>
            <td className="px-3 py-2">{u.endereco ?? "—"}</td>
            <td className="px-3 py-2">{u.raio_metros} m</td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

/* --------------------------------- escalas -------------------------------- */

function Escalas({ dados, gestor, aoSalvar }: { dados: DadosPonto; gestor: boolean; aoSalvar: () => void }) {
  const [form, setForm] = useState({ nome: "", tipo: "5x2", entrada: "08:00", saida: "17:00", intervalo_minutos: 60, carga_diaria_min: 480, tolerancia_min: 5, noturno: false });
  const [vinculo, setVinculo] = useState({ employee_id: "", schedule_id: "", inicio: hojeLocal() });

  const criar = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      const dias = form.tipo === "6x1" ? [1, 2, 3, 4, 5, 6] : form.tipo === "12x36" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
      const { error } = await supabase.from("pnt_work_schedules").insert({
        organization_id: dados.organizationId,
        nome: form.nome.trim(),
        tipo: form.tipo,
        entrada: form.entrada,
        saida: form.saida,
        intervalo_minutos: Number(form.intervalo_minutos),
        carga_diaria_min: Number(form.carga_diaria_min),
        tolerancia_min: Number(form.tolerancia_min),
        noturno: form.noturno,
        dias_semana: dias,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Escala cadastrada.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vincular = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      if (!vinculo.employee_id || !vinculo.schedule_id) throw new Error("Escolha funcionário e escala.");
      const { error } = await supabase.from("pnt_schedule_assignments").insert({
        organization_id: dados.organizationId,
        employee_id: vinculo.employee_id,
        schedule_id: vinculo.schedule_id,
        inicio: vinculo.inicio,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Escala vinculada ao funcionário.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {gestor && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nova escala</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <Label>Tipo</Label>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  <option value="5x2">5x2</option>
                  <option value="6x1">6x1</option>
                  <option value="12x36">12x36</option>
                  <option value="personalizada">Personalizada</option>
                </select>
              </div>
              <div>
                <Label>Entrada</Label>
                <Input type="time" value={form.entrada} onChange={(e) => setForm({ ...form, entrada: e.target.value })} />
              </div>
              <div>
                <Label>Saída</Label>
                <Input type="time" value={form.saida} onChange={(e) => setForm({ ...form, saida: e.target.value })} />
              </div>
              <div>
                <Label>Intervalo (min)</Label>
                <Input type="number" value={form.intervalo_minutos} onChange={(e) => setForm({ ...form, intervalo_minutos: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Carga diária (min)</Label>
                <Input type="number" value={form.carga_diaria_min} onChange={(e) => setForm({ ...form, carga_diaria_min: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Tolerância (min)</Label>
                <Input type="number" value={form.tolerancia_min} onChange={(e) => setForm({ ...form, tolerancia_min: Number(e.target.value) })} />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={form.noturno} onChange={(e) => setForm({ ...form, noturno: e.target.checked })} /> Noturna
                </label>
                <Button onClick={() => criar.mutate()} disabled={!form.nome.trim()}>
                  Cadastrar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vincular escala ao funcionário</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Funcionário</Label>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={vinculo.employee_id} onChange={(e) => setVinculo({ ...vinculo, employee_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {dados.funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Escala</Label>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={vinculo.schedule_id} onChange={(e) => setVinculo({ ...vinculo, schedule_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {dados.escalas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Início</Label>
                <Input type="date" value={vinculo.inicio} onChange={(e) => setVinculo({ ...vinculo, inicio: e.target.value })} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => vincular.mutate()}>Vincular</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabela cabecalho={["Escala", "Tipo", "Entrada", "Saída", "Carga diária", "Tolerância", "Vinculados"]}>
        {dados.escalas.length === 0 && <Vazio colunas={7} texto="Nenhuma escala cadastrada." />}
        {dados.escalas.map((s) => (
          <tr key={s.id}>
            <td className="px-3 py-2">{s.nome}</td>
            <td className="px-3 py-2">{s.tipo}</td>
            <td className="px-3 py-2">{s.entrada?.slice(0, 5) ?? "—"}</td>
            <td className="px-3 py-2">{s.saida?.slice(0, 5) ?? "—"}</td>
            <td className="px-3 py-2">{minutosParaTexto(s.carga_diaria_min)}</td>
            <td className="px-3 py-2">{s.tolerancia_min} min</td>
            <td className="px-3 py-2">{dados.vinculos.filter((v) => v.schedule_id === s.id).length}</td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

/* ----------------------------- banco de horas ----------------------------- */

function BancoHorasSecao({ dados }: { dados: DadosPonto }) {
  const porFuncionario = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const b of dados.banco) mapa.set(b.employee_id, (mapa.get(b.employee_id) ?? 0) + b.minutos);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [dados.banco]);

  return (
    <Tabela cabecalho={["Funcionário", "Saldo acumulado", "Lançamentos"]}>
      {porFuncionario.length === 0 && <Vazio colunas={3} texto="Nenhum saldo lançado ainda." />}
      {porFuncionario.map(([id, minutos]) => (
        <tr key={id}>
          <td className="px-3 py-2">{dados.funcionarios.find((f) => f.id === id)?.nome ?? "—"}</td>
          <td className={minutos < 0 ? "px-3 py-2 text-destructive" : "px-3 py-2"}>{minutosParaTexto(minutos)}</td>
          <td className="px-3 py-2">{dados.banco.filter((b) => b.employee_id === id).length}</td>
        </tr>
      ))}
    </Tabela>
  );
}

/* ---------------------------------- faltas -------------------------------- */

function Faltas({ dados, gestor, aoSalvar }: { dados: DadosPonto; gestor: boolean; aoSalvar: () => void }) {
  const [form, setForm] = useState({ employee_id: "", data: hojeLocal(), tipo: "falta", justificada: false, motivo: "" });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      if (!form.employee_id) throw new Error("Escolha o funcionário.");
      const { error } = await supabase.from("pnt_absences").insert({
        organization_id: dados.organizationId,
        employee_id: form.employee_id,
        data: form.data,
        tipo: form.tipo,
        justificada: form.justificada,
        motivo: form.motivo || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Falta registrada.");
      setForm({ ...form, motivo: "" });
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {gestor && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar falta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Label>Funcionário</Label>
              <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Selecione</option>
                {dados.funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="falta">Falta</option>
                <option value="atestado">Atestado</option>
                <option value="folga">Folga</option>
                <option value="ferias">Férias</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={form.justificada} onChange={(e) => setForm({ ...form, justificada: e.target.checked })} /> Justificada
              </label>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label>Motivo</Label>
              <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => salvar.mutate()}>Registrar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabela cabecalho={["Data", "Funcionário", "Tipo", "Justificada", "Motivo"]}>
        {dados.faltas.length === 0 && <Vazio colunas={5} texto="Nenhuma falta registrada." />}
        {dados.faltas.map((f) => (
          <tr key={f.id}>
            <td className="px-3 py-2">{dataBr(f.data)}</td>
            <td className="px-3 py-2">{dados.funcionarios.find((x) => x.id === f.employee_id)?.nome ?? "—"}</td>
            <td className="px-3 py-2">{f.tipo}</td>
            <td className="px-3 py-2">{f.justificada ? "Sim" : "Não"}</td>
            <td className="px-3 py-2 text-muted-foreground">{f.motivo ?? "—"}</td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

/* ------------------------------- aprovações ------------------------------- */

function Aprovacoes({ dados, podeDecidir, aoSalvar }: { dados: DadosPonto; podeDecidir: boolean; aoSalvar: () => void }) {
  const decidir = useServerFn(decidirAjuste);
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});

  const acao = useMutation({
    mutationFn: ({ id, aprovar }: { id: string; aprovar: boolean }) =>
      decidir({ data: { requestId: id, aprovar, justificativa: justificativas[id] ?? "" } }),
    onSuccess: () => {
      toast.success("Decisão registrada.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendentes = dados.pedidos.filter((p) => p.status === "pendente");

  return (
    <div className="space-y-4">
      {!podeDecidir && <Aviso>Somente supervisor, RH ou administrador podem aprovar correções.</Aviso>}
      {pendentes.length === 0 && <Aviso>Nenhuma solicitação pendente.</Aviso>}
      {pendentes.map((p) => (
        <Card key={p.id}>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                {dados.funcionarios.find((f) => f.id === p.employee_id)?.nome ?? "Funcionário"} — {ROTULO_TIPO[p.tipo]} em {dataBr(p.data_ref)} às {horaLocal(p.horario_correto)}
              </p>
              <p className="text-muted-foreground">Motivo: {p.motivo}</p>
              <Input
                placeholder="Justificativa da decisão"
                value={justificativas[p.id] ?? ""}
                onChange={(e) => setJustificativas({ ...justificativas, [p.id]: e.target.value })}
                disabled={!podeDecidir}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => acao.mutate({ id: p.id, aprovar: true })} disabled={!podeDecidir || acao.isPending}>
                Aprovar
              </Button>
              <Button variant="outline" onClick={() => acao.mutate({ id: p.id, aprovar: false })} disabled={!podeDecidir || acao.isPending}>
                Rejeitar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------- fechamento ------------------------------- */

function Fechamento({ dados, gestor, aoSalvar }: { dados: DadosPonto; gestor: boolean; aoSalvar: () => void }) {
  const fechar = useServerFn(fecharPeriodo);
  const recalcular = useServerFn(recalcularPeriodo);
  const [form, setForm] = useState({ inicio: `${hojeLocal().slice(0, 7)}-01`, fim: hojeLocal(), company_id: "" });

  const criar = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      const { error } = await supabase.from("pnt_payroll_periods").insert({
        organization_id: dados.organizationId,
        company_id: form.company_id || null,
        inicio: form.inicio,
        fim: form.fim,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Período criado.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: ({ id, fecharAgora }: { id: string; fecharAgora: boolean }) => fechar({ data: { periodoId: id, fechar: fecharAgora } }),
    onSuccess: () => {
      toast.success("Período atualizado.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recalcularTodos = useMutation({
    mutationFn: async (p: { inicio: string; fim: string }) => {
      for (const f of dados.funcionarios.filter((x) => x.ativo)) {
        await recalcular({ data: { employeeId: f.id, inicio: p.inicio, fim: p.fim } });
      }
    },
    onSuccess: () => {
      toast.success("Apuração recalculada.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {gestor && (
        <Card>
          <CardHeader>
            <CardTitle>Novo período de apuração</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>Início</Label>
              <Input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
            </div>
            <div>
              <Label>Empresa</Label>
              <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Todas</option>
                {dados.empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => criar.mutate()}>Criar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabela cabecalho={["Período", "Empresa", "Situação", "Fechado em", ""]}>
        {dados.periodos.length === 0 && <Vazio colunas={5} texto="Nenhum período criado." />}
        {dados.periodos.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2">{dataBr(p.inicio)} a {dataBr(p.fim)}</td>
            <td className="px-3 py-2">{dados.empresas.find((e) => e.id === p.company_id)?.nome ?? "Todas"}</td>
            <td className="px-3 py-2">{p.status}</td>
            <td className="px-3 py-2">{p.fechado_em ? dataHoraLocal(p.fechado_em) : "—"}</td>
            <td className="px-3 py-2">
              {gestor && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => recalcularTodos.mutate({ inicio: p.inicio, fim: p.fim })} disabled={recalcularTodos.isPending}>
                    Recalcular
                  </Button>
                  <Button size="sm" onClick={() => alternar.mutate({ id: p.id, fecharAgora: p.status !== "fechado" })}>
                    {p.status === "fechado" ? "Reabrir" : "Fechar"}
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

/* -------------------------------- relatórios ------------------------------ */

type TipoRelatorio = "espelho" | "atrasos" | "faltas" | "extras" | "banco" | "incompletos" | "fora_area" | "ajustes";

function Relatorios({ dados }: { dados: DadosPonto }) {
  const [tipo, setTipo] = useState<TipoRelatorio>("atrasos");
  const [inicio, setInicio] = useState(`${hojeLocal().slice(0, 7)}-01`);
  const [fim, setFim] = useState(hojeLocal());

  const nome = (id: string) => dados.funcionarios.find((f) => f.id === id)?.nome ?? "—";
  const dentro = (d: string) => d >= inicio && d <= fim;

  const { cabecalho, linhas } = useMemo(() => {
    switch (tipo) {
      case "atrasos":
        return {
          cabecalho: ["Data", "Funcionário", "Atraso", "Saída antecipada"],
          linhas: dados.resumos.filter((r) => dentro(r.data) && (r.atraso_min > 0 || r.saida_antecipada_min > 0)).map((r) => [dataBr(r.data), nome(r.employee_id), minutosParaTexto(r.atraso_min), minutosParaTexto(r.saida_antecipada_min)]),
        };
      case "faltas":
        return {
          cabecalho: ["Data", "Funcionário", "Tipo", "Justificada", "Motivo"],
          linhas: dados.faltas.filter((f) => dentro(f.data)).map((f) => [dataBr(f.data), nome(f.employee_id), f.tipo, f.justificada ? "Sim" : "Não", f.motivo ?? ""]),
        };
      case "extras":
        return {
          cabecalho: ["Data", "Funcionário", "Horas extras", "Adicional noturno"],
          linhas: dados.resumos.filter((r) => dentro(r.data) && r.extra_min > 0).map((r) => [dataBr(r.data), nome(r.employee_id), minutosParaTexto(r.extra_min), minutosParaTexto(r.noturno_min)]),
        };
      case "banco":
        return {
          cabecalho: ["Funcionário", "Saldo"],
          linhas: [...new Set(dados.banco.filter((b) => dentro(b.data)).map((b) => b.employee_id))].map((id) => [nome(id), minutosParaTexto(dados.banco.filter((b) => b.employee_id === id && dentro(b.data)).reduce((s, b) => s + b.minutos, 0))]),
        };
      case "incompletos":
        return {
          cabecalho: ["Data", "Funcionário", "Situação", "Trabalhado"],
          linhas: dados.resumos.filter((r) => dentro(r.data) && r.situacao === "incompleto").map((r) => [dataBr(r.data), nome(r.employee_id), r.situacao, minutosParaTexto(r.trabalhado_min)]),
        };
      case "fora_area":
        return {
          cabecalho: ["Data", "Funcionário", "Tipo", "Distância"],
          linhas: dados.marcacoes.filter((m) => dentro(m.data_ref) && m.status === "fora_area").map((m) => [dataBr(m.data_ref), nome(m.employee_id), m.tipo, m.distancia_m ? `${Math.round(m.distancia_m)} m` : "—"]),
        };
      case "ajustes":
        return {
          cabecalho: ["Data", "Funcionário", "Tipo", "Situação", "Decisão"],
          linhas: dados.pedidos.filter((p) => dentro(p.data_ref)).map((p) => [dataBr(p.data_ref), nome(p.employee_id), p.tipo, p.status, p.justificativa_decisao ?? ""]),
        };
      default:
        return {
          cabecalho: ["Data", "Funcionário", "Trabalhado", "Previsto", "Saldo"],
          linhas: dados.resumos.filter((r) => dentro(r.data)).map((r) => [dataBr(r.data), nome(r.employee_id), minutosParaTexto(r.trabalhado_min), minutosParaTexto(r.previsto_min), minutosParaTexto(r.saldo_min)]),
        };
    }
  }, [tipo, inicio, fim, dados]);

  const exportarPdf = async () => {
    const [{ jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    doc.setFontSize(13);
    doc.text(`Relatório de ponto — ${tipo}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${dataBr(inicio)} a ${dataBr(fim)}`, 14, 22);
    autoTable.default(doc, { startY: 27, head: [cabecalho], body: linhas });
    doc.save(`ponto-${tipo}.pdf`);
  };

  const exportarExcel = async () => {
    const xlsx = await import("xlsx");
    const planilha = xlsx.utils.aoa_to_sheet([cabecalho, ...linhas]);
    const livro = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(livro, planilha, "Relatório");
    xlsx.writeFile(livro, `ponto-${tipo}.xlsx`);
  };

  const exportarCsv = () => {
    const csv = [cabecalho, ...linhas].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponto-${tipo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Label>Relatório</Label>
          <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelatorio)}>
            <option value="espelho">Espelho por funcionário</option>
            <option value="atrasos">Atrasos</option>
            <option value="faltas">Faltas</option>
            <option value="extras">Horas extras</option>
            <option value="banco">Banco de horas</option>
            <option value="incompletos">Pontos incompletos</option>
            <option value="fora_area">Registros fora da área</option>
            <option value="ajustes">Ajustes e aprovações</option>
          </select>
        </div>
        <div>
          <Label>Início</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div>
          <Label>Fim</Label>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <Button variant="outline" onClick={exportarPdf} disabled={linhas.length === 0}>
          <Download className="size-4" /> PDF
        </Button>
        <Button variant="outline" onClick={exportarExcel} disabled={linhas.length === 0}>
          <Download className="size-4" /> Excel
        </Button>
        <Button variant="outline" onClick={exportarCsv} disabled={linhas.length === 0}>
          <Download className="size-4" /> CSV
        </Button>
      </div>

      <Tabela cabecalho={cabecalho}>
        {linhas.length === 0 && <Vazio colunas={cabecalho.length} texto="Nenhum dado no período escolhido." />}
        {linhas.map((l, i) => (
          <tr key={i}>
            {l.map((c, j) => (
              <td key={j} className="px-3 py-2">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

/* ------------------------------ configurações ----------------------------- */

function Configuracoes({ dados, gestor, aoSalvar }: { dados: DadosPonto; gestor: boolean; aoSalvar: () => void }) {
  const cfg = dados.configuracoes;
  const [form, setForm] = useState({
    tolerancia_min: cfg?.tolerancia_min ?? 5,
    raio_padrao_m: cfg?.raio_padrao_m ?? 200,
    exige_geolocalizacao: cfg?.exige_geolocalizacao ?? false,
    exige_selfie: cfg?.exige_selfie ?? false,
    limite_extra_diario_min: cfg?.limite_extra_diario_min ?? 120,
    banco_horas: cfg?.banco_horas ?? true,
    retencao_dias: cfg?.retencao_dias ?? 1825,
  });
  const [feriado, setFeriado] = useState({ data: hojeLocal(), nome: "" });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!cfg) throw new Error("Configuração não encontrada.");
      const { error } = await supabase.from("pnt_settings").update(form).eq("id", cfg.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configurações salvas.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const novoFeriado = useMutation({
    mutationFn: async () => {
      if (!dados.organizationId) throw new Error("Organização não configurada.");
      const { error } = await supabase.from("pnt_holidays").insert({
        organization_id: dados.organizationId,
        data: feriado.data,
        nome: feriado.nome.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Feriado cadastrado.");
      setFeriado({ data: hojeLocal(), nome: "" });
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Regras gerais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Tolerância (min)</Label>
            <Input type="number" value={form.tolerancia_min} onChange={(e) => setForm({ ...form, tolerancia_min: Number(e.target.value) })} disabled={!gestor} />
          </div>
          <div>
            <Label>Área permitida padrão (m)</Label>
            <Input type="number" value={form.raio_padrao_m} onChange={(e) => setForm({ ...form, raio_padrao_m: Number(e.target.value) })} disabled={!gestor} />
          </div>
          <div>
            <Label>Limite de horas extras por dia (min)</Label>
            <Input type="number" value={form.limite_extra_diario_min} onChange={(e) => setForm({ ...form, limite_extra_diario_min: Number(e.target.value) })} disabled={!gestor} />
          </div>
          <div>
            <Label>Guardar registros por (dias)</Label>
            <Input type="number" value={form.retencao_dias} onChange={(e) => setForm({ ...form, retencao_dias: Number(e.target.value) })} disabled={!gestor} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.exige_geolocalizacao} onChange={(e) => setForm({ ...form, exige_geolocalizacao: e.target.checked })} disabled={!gestor} /> Exigir localização
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.exige_selfie} onChange={(e) => setForm({ ...form, exige_selfie: e.target.checked })} disabled={!gestor} /> Exigir selfie
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.banco_horas} onChange={(e) => setForm({ ...form, banco_horas: e.target.checked })} disabled={!gestor} /> Usar banco de horas
          </label>
          <div className="flex items-end">
            <Button onClick={() => salvar.mutate()} disabled={!gestor}>
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feriados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {gestor && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={feriado.data} onChange={(e) => setFeriado({ ...feriado, data: e.target.value })} />
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={feriado.nome} onChange={(e) => setFeriado({ ...feriado, nome: e.target.value })} />
              </div>
              <Button onClick={() => novoFeriado.mutate()} disabled={!feriado.nome.trim()}>
                Adicionar
              </Button>
            </div>
          )}
          <Tabela cabecalho={["Data", "Feriado", "Abrangência"]}>
            {dados.feriados.length === 0 && <Vazio colunas={3} texto="Nenhum feriado cadastrado." />}
            {dados.feriados.map((f) => (
              <tr key={f.id}>
                <td className="px-3 py-2">{dataBr(f.data)}</td>
                <td className="px-3 py-2">{f.nome}</td>
                <td className="px-3 py-2">{f.abrangencia}</td>
              </tr>
            ))}
          </Tabela>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------- auditoria ------------------------------- */

function AuditoriaSecao({ dados }: { dados: DadosPonto }) {
  return (
    <Tabela cabecalho={["Quando", "Ação", "Recurso", "Detalhes"]}>
      {dados.auditoria.length === 0 && <Vazio colunas={4} texto="Nenhum registro de auditoria." />}
      {dados.auditoria.map((a) => (
        <tr key={a.id}>
          <td className="px-3 py-2">{dataHoraLocal(a.created_at)}</td>
          <td className="px-3 py-2">{a.acao}</td>
          <td className="px-3 py-2">{a.recurso}</td>
          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{JSON.stringify(a.detalhes)}</td>
        </tr>
      ))}
    </Tabela>
  );
}
