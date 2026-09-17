import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BatteryLow,
  Building2,
  Car,
  Plus,
  Radar,
  RadioTower,
  Siren,
  UserCheck,
  UserX,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  nxsAtualizarAlerta,
  nxsColaboradores,
  nxsCriarColaborador,
  nxsCriarDispositivo,
  nxsCriarEmpresa,
  nxsDispositivos,
  nxsEmpresas,
  nxsPainel,
} from "@/lib/nxs.functions";

export const Route = createFileRoute("/_authenticated/nxs-control")({
  head: () => ({
    meta: [
      { title: "NXS CONTROL | Torre de controle operacional" },
      {
        name: "description",
        content:
          "Monitoramento operacional em tempo real de pessoas, veículos e ativos: posições, alertas, dispositivos e indicadores por empresa.",
      },
      { property: "og:title", content: "NXS CONTROL | Torre de controle operacional" },
      {
        property: "og:description",
        content:
          "Torre de controle com posições em tempo real, alertas e indicadores operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NxsControlPage,
});

const CHAVE_EMPRESA = "nxs-empresa-ativa";

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Indicador({
  titulo,
  valor,
  icone: Icone,
  tom = "normal",
}: {
  titulo: string;
  valor: number;
  icone: React.ElementType;
  tom?: "normal" | "alerta" | "critico" | "bom";
}) {
  const tons = {
    normal: "border-border bg-card text-foreground",
    bom: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
    alerta: "border-orange-500/30 bg-orange-500/5 text-orange-500",
    critico: "border-destructive/40 bg-destructive/5 text-destructive",
  } as const;

  return (
    <div className={`rounded-xl border p-4 ${tons[tom]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
        <Icone className="size-4 shrink-0 opacity-80" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function NxsControlPage() {
  const queryClient = useQueryClient();
  const carregarEmpresas = useServerFn(nxsEmpresas);
  const criarEmpresa = useServerFn(nxsCriarEmpresa);
  const carregarPainel = useServerFn(nxsPainel);
  const carregarColaboradores = useServerFn(nxsColaboradores);
  const criarColaborador = useServerFn(nxsCriarColaborador);
  const carregarDispositivos = useServerFn(nxsDispositivos);
  const criarDispositivo = useServerFn(nxsCriarDispositivo);
  const atualizarAlerta = useServerFn(nxsAtualizarAlerta);

  const [empresaId, setEmpresaId] = useState<string>("");
  const [novaEmpresa, setNovaEmpresa] = useState("");
  const [conectado, setConectado] = useState(false);

  // A página abre primeiro; as empresas da NEXTI chegam em seguida.
  const nextiPronto = useNextiDiferido();
  const empresasQuery = useQuery({
    queryKey: ["nxs-empresas"],
    queryFn: () => carregarEmpresas(),
    enabled: nextiPronto,
  });

  const empresas = useMemo(() => empresasQuery.data ?? [], [empresasQuery.data]);

  useEffect(() => {
    if (empresaId || empresas.length === 0) return;
    let salva = "";
    try {
      salva = localStorage.getItem(CHAVE_EMPRESA) ?? "";
    } catch {
      /* armazenamento indisponível */
    }
    const escolhida = empresas.find((e) => e.id === salva)?.id ?? empresas[0]?.id ?? "";
    setEmpresaId(escolhida);
  }, [empresas, empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    try {
      localStorage.setItem(CHAVE_EMPRESA, empresaId);
    } catch {
      /* armazenamento indisponível */
    }
  }, [empresaId]);

  const painelQuery = useQuery({
    queryKey: ["nxs-painel", empresaId],
    enabled: Boolean(empresaId),
    refetchInterval: 30_000,
    queryFn: () => carregarPainel({ data: { companyId: empresaId } }),
  });

  const colaboradoresQuery = useQuery({
    queryKey: ["nxs-colaboradores", empresaId],
    enabled: Boolean(empresaId),
    queryFn: () => carregarColaboradores({ data: { companyId: empresaId } }),
  });

  const dispositivosQuery = useQuery({
    queryKey: ["nxs-dispositivos", empresaId],
    enabled: Boolean(empresaId),
    queryFn: () => carregarDispositivos({ data: { companyId: empresaId } }),
  });

  // Atualização em tempo real das posições e alertas da empresa ativa.
  useEffect(() => {
    if (!empresaId) return;
    const canal = supabase
      .channel(`nxs-${empresaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nxs_location_events",
          filter: `company_id=eq.${empresaId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["nxs-painel", empresaId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nxs_alerts", filter: `company_id=eq.${empresaId}` },
        () => queryClient.invalidateQueries({ queryKey: ["nxs-painel", empresaId] }),
      )
      .subscribe((status) => setConectado(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(canal);
      setConectado(false);
    };
  }, [empresaId, queryClient]);

  const painel = painelQuery.data;
  const indicadores = painel?.indicadores;

  const [colab, setColab] = useState({ nome: "", cpf: "", matricula: "", telefone: "", cargo: "" });
  const [device, setDevice] = useState({ codigo: "", modelo: "", imei: "" });
  const [salvando, setSalvando] = useState(false);

  async function cadastrarEmpresa() {
    if (novaEmpresa.trim().length < 2) {
      toast.error("Informe o nome da empresa.");
      return;
    }
    setSalvando(true);
    const r = await criarEmpresa({ data: { nome: novaEmpresa.trim() } });
    setSalvando(false);
    if (!r?.ok) {
      toast.error(r?.erro || "Não foi possível criar a empresa.");
      return;
    }
    setNovaEmpresa("");
    toast.success("Empresa criada.");
    await empresasQuery.refetch();
    setEmpresaId(r.id);
  }

  async function cadastrarColaborador() {
    if (!empresaId) return;
    setSalvando(true);
    const r = await criarColaborador({
      data: { companyId: empresaId, ...colab, rastreamentoPermitido: true, funcao: "colaborador" },
    });
    setSalvando(false);
    if (!r?.ok) {
      toast.error(r?.erro || "Não foi possível cadastrar o colaborador.");
      return;
    }
    setColab({ nome: "", cpf: "", matricula: "", telefone: "", cargo: "" });
    toast.success("Colaborador cadastrado.");
    colaboradoresQuery.refetch();
    painelQuery.refetch();
  }

  async function cadastrarDispositivo() {
    if (!empresaId) return;
    setSalvando(true);
    const r = await criarDispositivo({
      data: { companyId: empresaId, ...device, tipo: "celular" },
    });
    setSalvando(false);
    if (!r?.ok) {
      toast.error(r?.erro || "Não foi possível cadastrar o dispositivo.");
      return;
    }
    setDevice({ codigo: "", modelo: "", imei: "" });
    toast.success("Dispositivo cadastrado.");
    dispositivosQuery.refetch();
    painelQuery.refetch();
  }

  async function mudarAlerta(id: string, status: "reconhecido" | "em_atendimento" | "resolvido") {
    const r = await atualizarAlerta({ data: { id, status, motivo: "" } });
    if (!r?.ok) {
      toast.error(r?.erro || "Não foi possível atualizar o alerta.");
      return;
    }
    painelQuery.refetch();
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-border bg-gradient-to-r from-black via-zinc-950 to-red-950/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-4 py-8 sm:px-6 sm:py-10">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:underline"
              aria-label="Voltar para a página inicial"
            >
              <ArrowLeft className="size-3.5" /> Painel Inicial
            </Link>
            <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold uppercase tracking-tight text-white sm:text-4xl">
              <Radar className="size-8 text-red-500" />
              NXS Control
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Torre de controle operacional: pessoas, veículos, ativos e equipamentos monitorados em
              tempo real, com alertas, dispositivos e indicadores por empresa.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span
              className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-[11px] font-semibold uppercase ${
                conectado
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
            >
              <RadioTower className="size-3.5" />
              {conectado ? "Tempo real ativo" : "Conectando"}
            </span>
            {empresas.length > 0 && (
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger className="w-64 bg-zinc-900 text-white">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {empresasQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : empresas.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5 text-red-500" /> Cadastre a primeira empresa
              </CardTitle>
              <CardDescription>
                O NXS Control separa todos os dados por empresa. Crie uma para começar a monitorar.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Label htmlFor="nxs-empresa">Nome da empresa</Label>
                <Input
                  id="nxs-empresa"
                  value={novaEmpresa}
                  onChange={(e) => setNovaEmpresa(e.target.value)}
                  placeholder="Ex.: Central Operacional Sul"
                />
              </div>
              <Button onClick={cadastrarEmpresa} disabled={salvando}>
                <Plus className="mr-1.5 size-4" /> Criar empresa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="torre">
            <TabsList className="flex-wrap">
              <TabsTrigger value="torre">Torre de controle</TabsTrigger>
              <TabsTrigger value="pessoas">Colaboradores</TabsTrigger>
              <TabsTrigger value="dispositivos">Dispositivos</TabsTrigger>
              <TabsTrigger value="alertas">Alertas</TabsTrigger>
            </TabsList>

            <TabsContent value="torre" className="space-y-6 pt-4">
              {painelQuery.isLoading || !indicadores ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Indicador
                    titulo="Pessoas monitoradas"
                    valor={indicadores.pessoasMonitoradas}
                    icone={Users}
                  />
                  <Indicador
                    titulo="Pessoas online"
                    valor={indicadores.pessoasOnline}
                    icone={UserCheck}
                    tom="bom"
                  />
                  <Indicador
                    titulo="Pessoas offline"
                    valor={indicadores.pessoasOffline}
                    icone={UserX}
                    tom="alerta"
                  />
                  <Indicador
                    titulo="Veículos ativos"
                    valor={indicadores.veiculosAtivos}
                    icone={Car}
                  />
                  <Indicador
                    titulo="Dispositivos"
                    valor={indicadores.dispositivos}
                    icone={Activity}
                  />
                  <Indicador
                    titulo="Sem comunicação"
                    valor={indicadores.semComunicacao}
                    icone={WifiOff}
                    tom="alerta"
                  />
                  <Indicador
                    titulo="Bateria baixa"
                    valor={indicadores.bateriaBaixa}
                    icone={BatteryLow}
                    tom="alerta"
                  />
                  <Indicador
                    titulo="Alertas abertos"
                    valor={indicadores.alertasAbertos}
                    icone={AlertTriangle}
                    tom="alerta"
                  />
                  <Indicador
                    titulo="Emergências ativas"
                    valor={indicadores.emergenciasAtivas}
                    icone={Siren}
                    tom="critico"
                  />
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Últimas posições recebidas</CardTitle>
                  <CardDescription>
                    Cada posição guarda a hora do aparelho e a hora de recebimento, e nunca é
                    substituída. A lista se atualiza sozinha.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(painel?.posicoes.length ?? 0) === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhuma posição recebida ainda. Cadastre um dispositivo e envie posições para
                      o endereço de recebimento.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="py-2 pr-3">Identificação</th>
                            <th className="py-2 pr-3">Dispositivo</th>
                            <th className="py-2 pr-3">Situação</th>
                            <th className="py-2 pr-3">Velocidade</th>
                            <th className="py-2 pr-3">Bateria</th>
                            <th className="py-2 pr-3">Atualizado</th>
                            <th className="py-2 pr-3">Local</th>
                          </tr>
                        </thead>
                        <tbody>
                          {painel?.posicoes.map((p) => (
                            <tr key={p.id} className="border-b border-border/50">
                              <td className="py-2 pr-3 font-medium">{p.nome}</td>
                              <td className="py-2 pr-3 text-muted-foreground">{p.dispositivo}</td>
                              <td className="py-2 pr-3">
                                <Badge variant={p.online ? "default" : "secondary"}>
                                  {p.online ? "Online" : "Offline"}
                                </Badge>
                              </td>
                              <td className="py-2 pr-3 tabular-nums">
                                {p.velocidade === null ? "—" : `${Math.round(p.velocidade)} km/h`}
                              </td>
                              <td className="py-2 pr-3 tabular-nums">
                                {p.bateria === null ? "—" : `${p.bateria}%`}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {formatarData(p.registrado_em)}
                              </td>
                              <td className="py-2 pr-3">
                                <a
                                  className="text-red-500 hover:underline"
                                  href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver no mapa
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pessoas" className="space-y-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Novo colaborador monitorado</CardTitle>
                  <CardDescription>Cadastro vinculado à empresa selecionada.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <Label htmlFor="c-nome">Nome completo</Label>
                    <Input
                      id="c-nome"
                      value={colab.nome}
                      onChange={(e) => setColab({ ...colab, nome: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="c-cpf">CPF</Label>
                    <Input
                      id="c-cpf"
                      value={colab.cpf}
                      onChange={(e) => setColab({ ...colab, cpf: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="c-mat">Matrícula</Label>
                    <Input
                      id="c-mat"
                      value={colab.matricula}
                      onChange={(e) => setColab({ ...colab, matricula: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="c-tel">Telefone</Label>
                    <Input
                      id="c-tel"
                      value={colab.telefone}
                      onChange={(e) => setColab({ ...colab, telefone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="c-cargo">Cargo</Label>
                    <Input
                      id="c-cargo"
                      value={colab.cargo}
                      onChange={(e) => setColab({ ...colab, cargo: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={cadastrarColaborador}
                      disabled={salvando || colab.nome.trim().length < 3}
                    >
                      <Plus className="mr-1.5 size-4" /> Cadastrar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Colaboradores</CardTitle>
                  <CardDescription>
                    {colaboradoresQuery.data?.colaboradores.length ?? 0} registro(s).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {colaboradoresQuery.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (colaboradoresQuery.data?.colaboradores.length ?? 0) === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhum colaborador cadastrado.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="py-2 pr-3">Nome</th>
                            <th className="py-2 pr-3">Matrícula</th>
                            <th className="py-2 pr-3">Cargo</th>
                            <th className="py-2 pr-3">Telefone</th>
                            <th className="py-2 pr-3">Rastreamento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {colaboradoresQuery.data?.colaboradores.map((c) => (
                            <tr key={c.id} className="border-b border-border/50">
                              <td className="py-2 pr-3 font-medium">{c.nome}</td>
                              <td className="py-2 pr-3">{c.matricula ?? "—"}</td>
                              <td className="py-2 pr-3">{c.cargo ?? "—"}</td>
                              <td className="py-2 pr-3">{c.telefone ?? "—"}</td>
                              <td className="py-2 pr-3">
                                <Badge variant={c.rastreamento_permitido ? "default" : "secondary"}>
                                  {c.rastreamento_permitido ? "Autorizado" : "Não autorizado"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dispositivos" className="space-y-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Novo dispositivo</CardTitle>
                  <CardDescription>
                    Ao cadastrar, o sistema gera uma chave exclusiva de envio de posições.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="d-cod">Código</Label>
                    <Input
                      id="d-cod"
                      value={device.codigo}
                      onChange={(e) => setDevice({ ...device, codigo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="d-mod">Modelo</Label>
                    <Input
                      id="d-mod"
                      value={device.modelo}
                      onChange={(e) => setDevice({ ...device, modelo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="d-imei">IMEI</Label>
                    <Input
                      id="d-imei"
                      value={device.imei}
                      onChange={(e) => setDevice({ ...device, imei: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={cadastrarDispositivo}
                      disabled={salvando || device.codigo.trim().length < 2}
                    >
                      <Plus className="mr-1.5 size-4" /> Cadastrar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dispositivos e rastreadores</CardTitle>
                  <CardDescription>
                    Envie posições por POST em <code>/api/public/nxs/posicao</code> com o cabeçalho
                    <code> x-device-token</code>.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {dispositivosQuery.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (dispositivosQuery.data?.dispositivos.length ?? 0) === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhum dispositivo cadastrado.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="py-2 pr-3">Código</th>
                            <th className="py-2 pr-3">Tipo</th>
                            <th className="py-2 pr-3">Bateria</th>
                            <th className="py-2 pr-3">Última comunicação</th>
                            <th className="py-2 pr-3">Chave de envio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dispositivosQuery.data?.dispositivos.map((d) => (
                            <tr key={d.id} className="border-b border-border/50">
                              <td className="py-2 pr-3 font-medium">{d.codigo}</td>
                              <td className="py-2 pr-3">{d.tipo}</td>
                              <td className="py-2 pr-3 tabular-nums">
                                {d.bateria === null ? "—" : `${d.bateria}%`}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {formatarData(d.ultima_comunicacao)}
                              </td>
                              <td className="py-2 pr-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    navigator.clipboard.writeText(d.ingest_token);
                                    toast.success("Chave copiada.");
                                  }}
                                >
                                  Copiar chave
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alertas" className="space-y-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Alertas e ocorrências</CardTitle>
                  <CardDescription>Últimos 50 registros da empresa selecionada.</CardDescription>
                </CardHeader>
                <CardContent>
                  {(painel?.alertas.length ?? 0) === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhum alerta registrado.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {painel?.alertas.map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                        >
                          <div>
                            <p className="text-sm font-semibold">
                              {a.codigo} · {a.tipo}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatarData(a.created_at)} · prioridade {a.prioridade}
                            </p>
                            {a.descricao && <p className="mt-1 text-sm">{a.descricao}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                a.status === "resolvido"
                                  ? "secondary"
                                  : a.prioridade === "critica"
                                    ? "destructive"
                                    : "default"
                              }
                            >
                              {a.status}
                            </Badge>
                            {a.status !== "resolvido" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => mudarAlerta(a.id, "em_atendimento")}
                                >
                                  Assumir
                                </Button>
                                <Button size="sm" onClick={() => mudarAlerta(a.id, "resolvido")}>
                                  Resolver
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
