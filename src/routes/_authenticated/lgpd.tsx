import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, ShieldCheck, Download, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import {
  BASES_LEGAIS,
  TIPOS_SOLICITACAO,
  atualizarIncidente,
  criarSolicitacaoTitular,
  exportarMeusDados,
  getLgpdPanorama,
  registrarIncidente,
  responderSolicitacao,
  salvarLgpdConfig,
  type LgpdConfig,
} from "@/lib/lgpd.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/lgpd")({
  head: () => ({
    meta: [
      { title: "LGPD · Conformidade e Direitos do Titular" },
      {
        name: "description",
        content:
          "Painel de conformidade com a Lei nº 13.709/2018: consentimentos, direitos do titular, retenção, incidentes e registros de acesso.",
      },
      { property: "og:title", content: "LGPD · Conformidade e Direitos do Titular" },
      {
        property: "og:description",
        content: "Gestão de consentimentos, solicitações, retenção de dados e incidentes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LgpdPage,
});

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  concluida: "Concluída",
  recusada: "Recusada",
};

function Metrica({
  titulo,
  valor,
  alerta,
}: {
  titulo: string;
  valor: string | number;
  alerta?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p
          className={`mt-1 text-2xl font-bold ${alerta && Number(valor) > 0 ? "text-destructive" : "text-foreground"}`}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

function LgpdPage() {
  const carregar = useServerFn(getLgpdPanorama);
  const criarSolic = useServerFn(criarSolicitacaoTitular);
  const responder = useServerFn(responderSolicitacao);
  const exportar = useServerFn(exportarMeusDados);
  const salvarConfig = useServerFn(salvarLgpdConfig);
  const novoIncidente = useServerFn(registrarIncidente);
  const editarIncidente = useServerFn(atualizarIncidente);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["lgpd-panorama"],
    queryFn: () => carregar(),
  });

  const [tipo, setTipo] = useState<string>("acesso");
  const [descricao, setDescricao] = useState("");
  const [config, setConfig] = useState<Partial<LgpdConfig> | null>(null);
  const [incTitulo, setIncTitulo] = useState("");
  const [incDescricao, setIncDescricao] = useState("");
  const [incTitulares, setIncTitulares] = useState("0");

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["lgpd-panorama"] });

  const mCriar = useMutation({
    mutationFn: () => criarSolic({ data: { tipo, descricao } }),
    onSuccess: () => {
      toast.success("Solicitação registrada. O prazo legal de resposta começou a contar.");
      setDescricao("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mResponder = useMutation({
    mutationFn: (p: { id: string; status: string; resposta: string }) => responder({ data: p }),
    onSuccess: () => {
      toast.success("Solicitação atualizada.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mSalvar = useMutation({
    mutationFn: () => salvarConfig({ data: { ...(data?.config ?? {}), ...(config ?? {}) } }),
    onSuccess: () => {
      toast.success("Configuração LGPD salva.");
      setConfig(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mIncidente = useMutation({
    mutationFn: () =>
      novoIncidente({
        data: {
          titulo: incTitulo,
          descricao: incDescricao,
          titularesAfetados: Number(incTitulares) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Incidente registrado.");
      setIncTitulo("");
      setIncDescricao("");
      setIncTitulares("0");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mExportar = useMutation({
    mutationFn: () => exportar(),
    onSuccess: (res) => {
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-lgpd-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída (direito à portabilidade).");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cfg = { ...(data?.config ?? ({} as LgpdConfig)), ...(config ?? {}) } as LgpdConfig;
  const isAdmin = data?.isAdmin === true;

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <ShieldCheck className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">LGPD</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Conformidade com a Lei nº 13.709/2018 — coleta, armazenamento e uso de dados pessoais.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando painel de conformidade…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <Metrica
                titulo="Solicitações abertas"
                valor={data?.metricas.solicitacoesAbertas ?? 0}
              />
              <Metrica
                titulo="Fora do prazo"
                valor={data?.metricas.solicitacoesVencidas ?? 0}
                alerta
              />
              <Metrica titulo="Prazo médio (dias)" valor={data?.metricas.prazoMedioDias ?? 0} />
              <Metrica
                titulo="Incidentes abertos"
                valor={data?.metricas.incidentesAbertos ?? 0}
                alerta
              />
              <Metrica titulo="Acessos registrados" valor={data?.metricas.acessos30d ?? 0} />
              <Metrica
                titulo="Meu consentimento"
                valor={data?.consentimentoAtual?.aceito ? "Ativo" : "Pendente"}
              />
            </div>

            <Tabs defaultValue="direitos">
              <TabsList className="flex-wrap">
                <TabsTrigger value="direitos">Meus direitos</TabsTrigger>
                <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
                <TabsTrigger value="acessos">Registros de acesso</TabsTrigger>
                {isAdmin && <TabsTrigger value="incidentes">Incidentes</TabsTrigger>}
                {isAdmin && <TabsTrigger value="config">Regras e retenção</TabsTrigger>}
              </TabsList>

              {/* ── Direitos do titular ── */}
              <TabsContent value="direitos" className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Exercer um direito (art. 18)</CardTitle>
                    <CardDescription>
                      O prazo legal de resposta é de {cfg.prazoRespostaDias ?? 15} dias corridos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Tipo de solicitação</Label>
                        <Select value={tipo} onValueChange={setTipo}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPOS_SOLICITACAO.map((t) => (
                              <SelectItem key={t.key} value={t.key}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Portabilidade imediata</Label>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={mExportar.isPending}
                          onClick={() => mExportar.mutate()}
                        >
                          <Download className="size-4" />
                          Exportar meus dados (JSON)
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Descrição do pedido</Label>
                      <Textarea
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        placeholder="Descreva o que deseja em relação aos seus dados pessoais."
                        rows={3}
                      />
                    </div>
                    <Button
                      disabled={mCriar.isPending || !descricao.trim()}
                      onClick={() => mCriar.mutate()}
                    >
                      <Plus className="size-4" />
                      Enviar solicitação
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Bases legais utilizadas</CardTitle>
                    <CardDescription>
                      Todo acesso a dado pessoal no sistema é registrado com base legal e
                      finalidade.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {BASES_LEGAIS.map((b) => (
                      <Badge key={b.key} variant="secondary">
                        {b.label}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Solicitações ── */}
              <TabsContent value="solicitacoes" className="mt-4 space-y-3">
                {(data?.solicitacoes ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>
                )}
                {(data?.solicitacoes ?? []).map((s) => {
                  const vencida =
                    s.status !== "concluida" &&
                    s.status !== "recusada" &&
                    s.prazoEm < new Date().toISOString().slice(0, 10);
                  return (
                    <Card key={s.id}>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>
                            {TIPOS_SOLICITACAO.find((t) => t.key === s.tipo)?.label ?? s.tipo}
                          </Badge>
                          <Badge variant={s.status === "concluida" ? "secondary" : "outline"}>
                            {STATUS_LABEL[s.status] ?? s.status}
                          </Badge>
                          <Badge variant={vencida ? "destructive" : "outline"}>
                            Prazo: {s.prazoEm}
                          </Badge>
                          {s.titularEmail && (
                            <span className="text-xs text-muted-foreground">{s.titularEmail}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground">{s.descricao}</p>
                        {s.resposta && (
                          <p className="rounded-md bg-secondary/60 p-2 text-sm text-muted-foreground">
                            <strong>Resposta:</strong> {s.resposta}
                          </p>
                        )}
                        {isAdmin && s.status !== "concluida" && (
                          <RespostaAdmin
                            pendente={mResponder.isPending}
                            onSalvar={(status, resposta) =>
                              mResponder.mutate({ id: s.id, status, resposta })
                            }
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>

              {/* ── Registros de acesso ── */}
              <TabsContent value="acessos" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Trilha de acesso a dados pessoais</CardTitle>
                    <CardDescription>
                      Princípio da prestação de contas (art. 6º, X): recurso, ação, base legal e
                      finalidade.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(data?.acessos ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum acesso registrado ainda.
                      </p>
                    )}
                    {(data?.acessos ?? []).slice(0, 100).map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2 text-xs"
                      >
                        <span className="text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString("pt-BR")}
                        </span>
                        <Badge variant="outline">{a.recurso}</Badge>
                        <Badge variant="secondary">{a.acao}</Badge>
                        <span className="text-muted-foreground">{a.baseLegal}</span>
                        {a.finalidade && (
                          <span className="text-muted-foreground">· {a.finalidade}</span>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Incidentes ── */}
              {isAdmin && (
                <TabsContent value="incidentes" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Registrar incidente (art. 48)</CardTitle>
                      <CardDescription>
                        Incidentes com risco relevante devem ser comunicados à ANPD e aos titulares.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Input
                        value={incTitulo}
                        onChange={(e) => setIncTitulo(e.target.value)}
                        placeholder="Título do incidente"
                      />
                      <Textarea
                        value={incDescricao}
                        onChange={(e) => setIncDescricao(e.target.value)}
                        placeholder="O que aconteceu, quais dados foram afetados e quais medidas foram tomadas"
                        rows={3}
                      />
                      <div className="flex items-end gap-3">
                        <div className="space-y-1.5">
                          <Label>Titulares afetados</Label>
                          <Input
                            type="number"
                            className="w-40"
                            value={incTitulares}
                            onChange={(e) => setIncTitulares(e.target.value)}
                          />
                        </div>
                        <Button
                          disabled={mIncidente.isPending || !incTitulo.trim()}
                          onClick={() => mIncidente.mutate()}
                        >
                          <AlertTriangle className="size-4" />
                          Registrar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {(data?.incidentes ?? []).map((i) => (
                    <Card key={i.id}>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm text-foreground">{i.titulo}</strong>
                          <Badge variant="outline">{i.severidade}</Badge>
                          <Badge variant={i.status === "encerrado" ? "secondary" : "destructive"}>
                            {i.status}
                          </Badge>
                          <Badge variant={i.comunicadoAnpd ? "secondary" : "outline"}>
                            {i.comunicadoAnpd ? "ANPD comunicada" : "ANPD não comunicada"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {i.titularesAfetados} titular(es)
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{i.descricao}</p>
                        <div className="flex gap-2">
                          {!i.comunicadoAnpd && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                editarIncidente({ data: { id: i.id, comunicadoAnpd: true } }).then(
                                  invalidar,
                                )
                              }
                            >
                              Marcar como comunicado à ANPD
                            </Button>
                          )}
                          {i.status !== "encerrado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                editarIncidente({ data: { id: i.id, status: "encerrado" } }).then(
                                  invalidar,
                                )
                              }
                            >
                              Encerrar
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              )}

              {/* ── Configuração ── */}
              {isAdmin && (
                <TabsContent value="config" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Controlador e Encarregado (DPO)</CardTitle>
                      <CardDescription>Contato obrigatório do art. 41 da LGPD.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                      <Campo
                        label="Controlador"
                        value={cfg.controlador ?? ""}
                        onChange={(v) => setConfig((c) => ({ ...c, controlador: v }))}
                      />
                      <Campo
                        label="CNPJ"
                        value={cfg.controladorCnpj ?? ""}
                        onChange={(v) => setConfig((c) => ({ ...c, controladorCnpj: v }))}
                      />
                      <Campo
                        label="Encarregado (nome)"
                        value={cfg.encarregadoNome ?? ""}
                        onChange={(v) => setConfig((c) => ({ ...c, encarregadoNome: v }))}
                      />
                      <Campo
                        label="Encarregado (e-mail)"
                        value={cfg.encarregadoEmail ?? ""}
                        onChange={(v) => setConfig((c) => ({ ...c, encarregadoEmail: v }))}
                      />
                      <Campo
                        label="Encarregado (telefone)"
                        value={cfg.encarregadoTelefone ?? ""}
                        onChange={(v) => setConfig((c) => ({ ...c, encarregadoTelefone: v }))}
                      />
                      <Campo
                        label="Versão da política"
                        value={cfg.politicaVersao ?? "1.0"}
                        onChange={(v) => setConfig((c) => ({ ...c, politicaVersao: v }))}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Prazos de retenção e eliminação</CardTitle>
                      <CardDescription>
                        Em dias. Ao vencer, os dados devem ser eliminados ou anonimizados.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                      <Campo
                        label="Resposta ao titular (dias)"
                        value={String(cfg.prazoRespostaDias ?? 15)}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, prazoRespostaDias: Number(v) || 15 }))
                        }
                      />
                      <Campo
                        label="Atestados médicos"
                        value={String(cfg.retencaoAtestadosDias ?? 1825)}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, retencaoAtestadosDias: Number(v) || 0 }))
                        }
                      />
                      <Campo
                        label="Folhas de ponto"
                        value={String(cfg.retencaoFolhasDias ?? 1825)}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, retencaoFolhasDias: Number(v) || 0 }))
                        }
                      />
                      <Campo
                        label="Mensagens de chat"
                        value={String(cfg.retencaoChatDias ?? 365)}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, retencaoChatDias: Number(v) || 0 }))
                        }
                      />
                      <Campo
                        label="Registros de acesso"
                        value={String(cfg.retencaoLogsDias ?? 180)}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, retencaoLogsDias: Number(v) || 0 }))
                        }
                      />
                      <div className="flex items-center justify-between rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Anonimizar ao vencer
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Em vez de excluir, transformar em dado anônimo.
                          </p>
                        </div>
                        <Switch
                          checked={cfg.anonimizarAposRetencao ?? true}
                          onCheckedChange={(v) =>
                            setConfig((c) => ({ ...c, anonimizarAposRetencao: v }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Banner de consentimento
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Exibir aviso de tratamento de dados ao entrar no sistema.
                          </p>
                        </div>
                        <Switch
                          checked={cfg.bannerConsentimentoAtivo ?? true}
                          onCheckedChange={(v) =>
                            setConfig((c) => ({ ...c, bannerConsentimentoAtivo: v }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Texto da política de privacidade</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        rows={8}
                        value={cfg.politicaTexto ?? ""}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, politicaTexto: e.target.value }))
                        }
                      />
                      <div className="flex items-center gap-3">
                        <Button disabled={mSalvar.isPending} onClick={() => mSalvar.mutate()}>
                          Salvar configuração
                        </Button>
                        <Link to="/politica-privacidade" className="text-sm text-primary underline">
                          Ver política pública
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </div>
    </main>
  );
}

function Campo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RespostaAdmin({
  pendente,
  onSalvar,
}: {
  pendente: boolean;
  onSalvar: (status: string, resposta: string) => void;
}) {
  const [status, setStatus] = useState("em_analise");
  const [resposta, setResposta] = useState("");

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="em_analise">Em análise</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="recusada">Recusada</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" disabled={pendente} onClick={() => onSalvar(status, resposta)}>
          Responder titular
        </Button>
      </div>
      <Textarea
        rows={2}
        value={resposta}
        onChange={(e) => setResposta(e.target.value)}
        placeholder="Resposta formal ao titular"
      />
    </div>
  );
}
