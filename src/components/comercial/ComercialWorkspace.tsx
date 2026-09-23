import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2,
  Download, FileText, Filter, Loader2, Plus, Search, Target, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  carregarComercial, moeda, nomeCliente, registrarAuditoria,
  type ComercialDados, type ComercialModo, type EtapaComercial,
} from "@/lib/comercial";

const banco = supabase as any;
const rotaPorModo: Record<ComercialModo, string> = {
  dashboard: "/comercial", clientes: "/comercial-clientes", funil: "/comercial-funil",
  propostas: "/comercial-propostas", agenda: "/comercial-agenda",
  contratos: "/comercial-contratos", relatorios: "/comercial-relatorios",
};

const titulos: Record<ComercialModo, [string, string]> = {
  dashboard: ["Visão geral comercial", "Indicadores, agenda, funil e contratos em uma visão executiva."],
  clientes: ["Clientes e potenciais clientes", "Cadastro empresarial e origem dos leads comerciais."],
  funil: ["Funil de vendas", "Acompanhe e mova oportunidades por todas as etapas da negociação."],
  propostas: ["Propostas comerciais", "Custos, margem, impostos, versões e prévia para serviços terceirizados."],
  agenda: ["Agenda comercial", "Tarefas, reuniões, retornos e lembretes vinculados aos negócios."],
  contratos: ["Contratos", "Vigência, reajustes, documentos e encaminhamento para implantação."],
  relatorios: ["Relatórios de desempenho", "Resultados por vendedor, origem, etapa e período."],
};

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{rotulo}</Label>{children}</div>;
}

function Vazio({ texto }: { texto: string }) {
  return <div className="grid min-h-40 place-items-center border border-dashed border-border bg-background/40 p-6 text-center text-sm text-muted-foreground">{texto}</div>;
}

function Kpi({ titulo, valor, detalhe, icon: Icon, para }: { titulo: string; valor: string | number; detalhe: string; icon: React.ElementType; para?: "/comercial-clientes" | "/comercial-funil" | "/comercial-propostas" | "/comercial-agenda" | "/comercial-contratos" }) {
  const card = <Card className="border-border bg-background text-foreground transition-colors hover:border-primary/50"><CardContent className="flex items-start justify-between p-4"><div><p className="text-xs font-medium uppercase text-foreground0">{titulo}</p><p className="mt-2 text-2xl font-bold">{valor}</p><p className="mt-1 text-xs text-foreground0">{detalhe}</p></div><span className="grid size-9 place-items-center rounded-md bg-primary/15 text-primary"><Icon className="size-4" /></span></CardContent></Card>;
  return para ? <Link to={para} preload="intent" className="block">{card}</Link> : card;
}

export function ComercialWorkspace({ modo }: { modo: ComercialModo }) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [dialogo, setDialogo] = useState<null | "cliente" | "oportunidade" | "proposta" | "atividade" | "contrato">(null);
  const query = useQuery({
    queryKey: ["comercial-dados"],
    queryFn: carregarComercial,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (anterior) => anterior,
  });
  const dados = query.data ?? { clientes: [], etapas: [], oportunidades: [], propostas: [], atividades: [], contratos: [] };

  const salvar = useMutation({
    mutationFn: async ({ tabela, valores, auditoria, entidade }: { tabela: string; valores: Record<string, unknown>; auditoria: string; entidade: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sua sessão expirou.");
      const payload = { ...valores, responsavel_id: valores["responsavel_id"] || auth.user.id, created_by: auth.user.id };
      const { data, error } = await banco.from(tabela).insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      await registrarAuditoria(auditoria, entidade, data.id, valores);
      return data;
    },
    onSuccess: async () => { setDialogo(null); await queryClient.invalidateQueries({ queryKey: ["comercial-dados"] }); toast.success("Registro salvo com sucesso."); },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar."),
  });

  const mover = useMutation({
    mutationFn: async ({ id, etapa }: { id: string; etapa: EtapaComercial }) => {
      let motivo: string | null = null;
      if (etapa.tipo_final === "perdido") {
        motivo = window.prompt("Informe o motivo da perda:")?.trim() || null;
        if (!motivo) throw new Error("O motivo da perda é obrigatório.");
      }
      const { error } = await banco.from("com_oportunidades").update({ etapa_id: etapa.id, probabilidade: etapa.probabilidade, motivo_perda: motivo }).eq("id", id);
      if (error) throw new Error(error.message);
      await registrarAuditoria("movimentou_etapa", "oportunidade", id, { etapa: etapa.nome, motivo });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["comercial-dados"] }); },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Não foi possível mover."),
  });

  const concluir = async (id: string, concluida: boolean) => {
    const { error } = await banco.from("com_atividades").update({ concluida_em: concluida ? null : new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await registrarAuditoria(concluida ? "reabriu" : "concluiu", "atividade", id);
    await queryClient.invalidateQueries({ queryKey: ["comercial-dados"] });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-destructive/20 bg-background">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div><p className="text-xs font-semibold uppercase text-primary">Departamento Comercial</p><h1 className="mt-1 text-2xl font-semibold">{titulos[modo][0]}</h1><p className="mt-1 text-sm text-muted-foreground">{titulos[modo][1]}</p></div>
          <Acoes modo={modo} abrir={setDialogo} />
        </div>
      </header>
      <section className="mx-auto max-w-[88rem] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {query.isLoading ? <div className="grid min-h-72 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div> : query.isError ? <Vazio texto={(query.error as Error).message} /> : <Conteudo modo={modo} dados={dados} busca={busca} setBusca={setBusca} inicio={inicio} setInicio={setInicio} fim={fim} setFim={setFim} mover={mover.mutate} concluir={concluir} />}
      </section>
      <Formularios dialogo={dialogo} fechar={() => setDialogo(null)} dados={dados} salvar={salvar.mutate} salvando={salvar.isPending} />
    </main>
  );
}

function Acoes({ modo, abrir }: { modo: ComercialModo; abrir: (d: "cliente" | "oportunidade" | "proposta" | "atividade" | "contrato") => void }) {
  const acao = modo === "clientes" ? ["cliente", "Novo cliente"] : modo === "funil" ? ["oportunidade", "Nova oportunidade"] : modo === "propostas" ? ["proposta", "Nova proposta"] : modo === "agenda" ? ["atividade", "Nova atividade"] : modo === "contratos" ? ["contrato", "Novo contrato"] : null;
  return acao ? <Button onClick={() => abrir(acao[0] as "cliente" | "oportunidade" | "proposta" | "atividade" | "contrato")} className="bg-primary text-foreground hover:bg-primary/90"><Plus />{acao[1]}</Button> : null;
}

function Filtros({ busca, setBusca, inicio, setInicio, fim, setFim }: { busca: string; setBusca: (v: string) => void; inicio: string; setInicio: (v: string) => void; fim: string; setFim: (v: string) => void }) {
  return <div className="flex flex-wrap gap-2 border border-border bg-card p-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-foreground0" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, oportunidade ou número" className="border-border bg-background pl-9" /></div><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-40 border-border bg-background" aria-label="Data inicial" /><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-40 border-border bg-background" aria-label="Data final" /><Button variant="outline" size="icon" className="border-border" title="Filtros aplicados"><Filter /></Button></div>;
}

function Conteudo(props: { modo: ComercialModo; dados: ComercialDados; busca: string; setBusca: (v: string) => void; inicio: string; setInicio: (v: string) => void; fim: string; setFim: (v: string) => void; mover: (v: { id: string; etapa: EtapaComercial }) => void; concluir: (id: string, concluida: boolean) => void }) {
  const { modo, dados } = props;
  if (modo === "dashboard") return <Dashboard dados={dados} />;
  if (modo === "clientes") return <Clientes dados={dados} busca={props.busca} setBusca={props.setBusca} />;
  if (modo === "funil") return <Funil dados={dados} mover={props.mover} />;
  if (modo === "propostas") return <Propostas dados={dados} />;
  if (modo === "agenda") return <Agenda dados={dados} concluir={props.concluir} />;
  if (modo === "contratos") return <Contratos dados={dados} />;
  return <Relatorios {...props} />;
}

function Dashboard({ dados }: { dados: ComercialDados }) {
  const ganhas = dados.oportunidades.filter((o) => dados.etapas.find((e) => e.id === o.etapa_id)?.tipo_final === "ganho");
  const perdidas = dados.oportunidades.filter((o) => dados.etapas.find((e) => e.id === o.etapa_id)?.tipo_final === "perdido");
  const conversao = ganhas.length + perdidas.length ? Math.round((ganhas.length / (ganhas.length + perdidas.length)) * 100) : 0;
  const previsto = dados.oportunidades.reduce((s, o) => s + Number(o.valor_previsto), 0);
  const proximas = dados.atividades.filter((a) => !a.concluida_em).slice(0, 6);
  const vencimentos = dados.contratos.filter((c) => c.status === "ativo" && new Date(c.fim).getTime() < Date.now() + 90 * 86400000).slice(0, 6);
  return <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi titulo="Leads recebidos" valor={dados.clientes.filter((c) => c.tipo === "potencial").length} detalhe="Potenciais clientes ativos" icon={Users} para="/comercial-clientes" /><Kpi titulo="Propostas enviadas" valor={dados.propostas.filter((p) => p.status !== "rascunho").length} detalhe={`${dados.propostas.length} propostas no total`} icon={FileText} para="/comercial-propostas" /><Kpi titulo="Valor previsto" valor={moeda(previsto)} detalhe="Todas as oportunidades" icon={TrendingUp} para="/comercial-funil" /><Kpi titulo="Taxa de conversão" valor={`${conversao}%`} detalhe={`${ganhas.length} ganhos · ${perdidas.length} perdidos`} icon={Target} para="/comercial-funil" /></div><div className="grid gap-4 lg:grid-cols-2"><Card className="border-border bg-card"><CardHeader><CardTitle className="flex items-center justify-between gap-2">Funil atual<Link to="/comercial-funil" preload="intent" className="text-xs font-medium text-primary hover:underline">Ver funil</Link></CardTitle></CardHeader><CardContent className="space-y-3 pt-5">{dados.etapas.map((e) => { const lista = dados.oportunidades.filter((o) => o.etapa_id === e.id); return <div key={e.id} className="flex items-center gap-3"><span className="w-32 truncate text-sm text-muted-foreground">{e.nome}</span><div className="h-2 flex-1 overflow-hidden bg-muted"><div className="h-full bg-primary" style={{ width: `${dados.oportunidades.length ? Math.max(5, lista.length / dados.oportunidades.length * 100) : 0}%` }} /></div><span className="w-8 text-right text-sm font-semibold">{lista.length}</span></div>; })}</CardContent></Card><Card className="border-border bg-card"><CardHeader><CardTitle className="flex items-center justify-between gap-2">Próximas atividades<Link to="/comercial-agenda" preload="intent" className="text-xs font-medium text-primary hover:underline">Ver agenda</Link></CardTitle></CardHeader><CardContent className="space-y-2 pt-5">{proximas.length ? proximas.map((a) => <div key={a.id} className="flex items-center justify-between border-b border-border pb-2"><div><p className="text-sm font-medium">{a.titulo}</p><p className="text-xs text-foreground0">{nomeCliente(dados.clientes, a.cliente_id)}</p></div><Badge variant="outline">{new Date(a.inicio_em).toLocaleDateString("pt-BR")}</Badge></div>) : <p className="text-sm text-foreground0">Nenhuma atividade pendente.</p>}</CardContent></Card></div>{vencimentos.length > 0 && <Card className="border-destructive/30 bg-destructive/10"><CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-4" />Contratos próximos do vencimento<Link to="/comercial-contratos" preload="intent" className="ml-auto text-xs font-medium text-primary hover:underline">Ver contratos</Link></CardTitle></CardHeader><CardContent className="grid gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-3">{vencimentos.map((c) => <div key={c.id} className="border border-destructive/20 p-3"><p className="font-medium">{c.numero}</p><p className="text-xs text-muted-foreground">{nomeCliente(dados.clientes, c.cliente_id)} · {new Date(c.fim + "T12:00:00").toLocaleDateString("pt-BR")}</p></div>)}</CardContent></Card>}</>;
}

function Clientes({ dados, busca, setBusca }: { dados: ComercialDados; busca: string; setBusca: (v: string) => void }) {
  const lista = dados.clientes.filter((c) => `${c.razao_social} ${c.nome_fantasia} ${c.cnpj} ${c.segmento}`.toLowerCase().includes(busca.toLowerCase()));
  return <><Filtros busca={busca} setBusca={setBusca} inicio="" setInicio={() => {}} fim="" setFim={() => {}} />{lista.length ? <Card className="border-border bg-card"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>CNPJ</TableHead><TableHead>Contato</TableHead><TableHead>Segmento</TableHead><TableHead>Origem</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>{lista.map((c) => <TableRow key={c.id}><TableCell><p className="font-medium">{c.nome_fantasia || c.razao_social}</p><p className="text-xs text-foreground0">{c.razao_social}</p></TableCell><TableCell>{c.cnpj || "—"}</TableCell><TableCell><p>{c.telefone || "—"}</p><p className="text-xs text-foreground0">{c.email}</p></TableCell><TableCell>{c.segmento || "—"}</TableCell><TableCell>{c.origem_lead || "—"}</TableCell><TableCell><Badge variant={c.tipo === "cliente" ? "success" : "warning"}>{c.tipo === "cliente" ? "Cliente" : "Potencial"}</Badge></TableCell></TableRow>)}</TableBody></Table></Card> : <Vazio texto="Nenhum cliente cadastrado. Use “Novo cliente” para iniciar." />}</>;
}

function Funil({ dados, mover }: { dados: ComercialDados; mover: (v: { id: string; etapa: EtapaComercial }) => void }) {
  return <div className="overflow-x-auto pb-3"><div className="grid min-w-[1120px] grid-cols-7 gap-3">{dados.etapas.map((etapa) => { const itens = dados.oportunidades.filter((o) => o.etapa_id === etapa.id); return <section key={etapa.id} className="min-h-[28rem] border border-border bg-card"><div className="border-b border-border p-3"><div className="flex justify-between gap-2"><h2 className="text-sm font-semibold">{etapa.nome}</h2><Badge variant="outline">{itens.length}</Badge></div><p className="mt-1 text-xs text-foreground0">{moeda(itens.reduce((s, o) => s + Number(o.valor_previsto), 0))}</p></div><div className="space-y-2 p-2">{itens.map((o) => <article key={o.id} className="border border-border bg-background p-3"><p className="text-sm font-medium">{o.titulo}</p><p className="mt-1 text-xs text-foreground0">{nomeCliente(dados.clientes, o.cliente_id)}</p><p className="mt-3 text-sm font-semibold text-destructive">{moeda(o.valor_previsto)}</p><Select value={o.etapa_id} onValueChange={(id) => { const nova = dados.etapas.find((e) => e.id === id); if (nova) mover({ id: o.id, etapa: nova }); }}><SelectTrigger className="mt-3 h-8 border-border bg-card text-xs"><SelectValue /></SelectTrigger><SelectContent>{dados.etapas.map((e) => <SelectItem value={e.id} key={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></article>)}</div></section>; })}</div></div>;
}

function Propostas({ dados }: { dados: ComercialDados }) {
  const exportar = async (p: ComercialDados["propostas"][number]) => { const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]); const doc = new jsPDF(); doc.setFontSize(18); doc.text(`Proposta ${p.numero}`, 14, 20); doc.setFontSize(10); doc.text(`Valor mensal: ${moeda(p.valor_mensal)}`, 14, 32); doc.text(`Prazo: ${p.prazo_meses} meses`, 14, 39); const { data } = await banco.from("com_proposta_versoes").select("itens").eq("proposta_id", p.id).order("versao", { ascending: false }).limit(1).maybeSingle(); autoTable(doc, { startY: 48, head: [["Função", "Quantidade", "Jornada", "Escala", "Local", "Custo"]], body: ((data?.itens ?? []) as any[]).map((i) => [i.funcao, i.quantidade, i.jornada, i.escala, i.local, moeda(i.custo)]), theme: "grid" }); doc.save(`proposta-${p.numero}.pdf`); };
  return dados.propostas.length ? <Card className="border-border bg-card"><Table><TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Oportunidade</TableHead><TableHead>Versão</TableHead><TableHead>Valor mensal</TableHead><TableHead>Prazo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Prévia</TableHead></TableRow></TableHeader><TableBody>{dados.propostas.map((p) => <TableRow key={p.id}><TableCell className="font-medium">{p.numero}</TableCell><TableCell>{dados.oportunidades.find((o) => o.id === p.oportunidade_id)?.titulo || "—"}</TableCell><TableCell>v{p.versao_atual}</TableCell><TableCell>{moeda(p.valor_mensal)}</TableCell><TableCell>{p.prazo_meses} meses</TableCell><TableCell><Badge variant={p.status === "aprovada" ? "success" : p.status === "recusada" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => exportar(p)}><Download />PDF</Button></TableCell></TableRow>)}</TableBody></Table></Card> : <Vazio texto="Nenhuma proposta criada. A primeira versão ficará registrada no histórico." />;
}

function Agenda({ dados, concluir }: { dados: ComercialDados; concluir: (id: string, concluida: boolean) => void }) {
  return dados.atividades.length ? <div className="grid gap-3 lg:grid-cols-2">{dados.atividades.map((a) => { const concluida = !!a.concluida_em; const atrasada = !concluida && new Date(a.inicio_em) < new Date(); return <Card key={a.id} className="border-border bg-card"><CardContent className="flex items-start gap-3 p-4"><span className={`mt-0.5 grid size-9 place-items-center rounded-md ${atrasada ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}><CalendarDays className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{a.titulo}</p><Badge variant={concluida ? "success" : atrasada ? "destructive" : "secondary"}>{concluida ? "Concluída" : atrasada ? "Atrasada" : a.tipo}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{nomeCliente(dados.clientes, a.cliente_id)}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(a.inicio_em).toLocaleString("pt-BR")}</p></div><Button size="icon" variant="outline" onClick={() => concluir(a.id, concluida)} title={concluida ? "Reabrir" : "Concluir"}><CheckCircle2 /></Button></CardContent></Card>; })}</div> : <Vazio texto="Nenhuma atividade agendada." />;
}

function Contratos({ dados }: { dados: ComercialDados }) {
  return dados.contratos.length ? <Card className="border-border bg-card"><Table><TableHeader><TableRow><TableHead>Contrato</TableHead><TableHead>Cliente</TableHead><TableHead>Vigência</TableHead><TableHead>Valor mensal</TableHead><TableHead>Reajuste</TableHead><TableHead>Implantação</TableHead></TableRow></TableHeader><TableBody>{dados.contratos.map((c) => <TableRow key={c.id}><TableCell><p className="font-medium">{c.numero}</p><Badge variant={c.status === "ativo" ? "success" : "secondary"}>{c.status}</Badge></TableCell><TableCell>{nomeCliente(dados.clientes, c.cliente_id)}</TableCell><TableCell>{new Date(c.inicio + "T12:00:00").toLocaleDateString("pt-BR")} — {new Date(c.fim + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell><TableCell>{moeda(c.valor_mensal)}</TableCell><TableCell>{c.indice_reajuste || "—"}</TableCell><TableCell><Badge variant={c.implantacao_status === "concluido" ? "success" : "warning"}>{c.implantacao_status}</Badge></TableCell></TableRow>)}</TableBody></Table></Card> : <Vazio texto="Nenhum contrato registrado. Contratos podem nascer de propostas aprovadas." />;
}

function Relatorios(props: { dados: ComercialDados; busca: string; setBusca: (v: string) => void; inicio: string; setInicio: (v: string) => void; fim: string; setFim: (v: string) => void }) {
  const { dados, inicio, fim } = props;
  const ops = dados.oportunidades.filter((o) => (!inicio || o.created_at >= inicio) && (!fim || o.created_at.slice(0, 10) <= fim));
  const linhas = dados.etapas.map((e) => ({ etapa: e.nome, quantidade: ops.filter((o) => o.etapa_id === e.id).length, valor: ops.filter((o) => o.etapa_id === e.id).reduce((s, o) => s + Number(o.valor_previsto), 0) }));
  const excel = async () => { const XLSX = await import("xlsx"); const ws = XLSX.utils.json_to_sheet(linhas.map((l) => ({ Etapa: l.etapa, Oportunidades: l.quantidade, "Valor previsto": l.valor }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Desempenho"); XLSX.writeFile(wb, "relatorio-comercial.xlsx"); };
  const pdf = async () => { const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]); const doc = new jsPDF(); doc.text("Relatório de desempenho comercial", 14, 18); autoTable(doc, { startY: 25, head: [["Etapa", "Oportunidades", "Valor previsto"]], body: linhas.map((l) => [l.etapa, l.quantidade, moeda(l.valor)]) }); doc.save("relatorio-comercial.pdf"); };
  return <><Filtros {...props} busca="" setBusca={() => {}} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={pdf}><Download />PDF</Button><Button className="bg-primary text-foreground hover:bg-primary/90" onClick={excel}><Download />Excel</Button></div><div className="grid gap-4 lg:grid-cols-[1fr_2fr]"><Card className="border-border bg-card"><CardHeader><CardTitle>Resumo do período</CardTitle></CardHeader><CardContent className="space-y-3 pt-5"><Kpi titulo="Oportunidades" valor={ops.length} detalhe="No período selecionado" icon={Target} /><Kpi titulo="Valor previsto" valor={moeda(ops.reduce((s, o) => s + Number(o.valor_previsto), 0))} detalhe="Soma do pipeline" icon={BarChart3} /></CardContent></Card><Card className="border-border bg-card"><Table><TableHeader><TableRow><TableHead>Etapa</TableHead><TableHead>Oportunidades</TableHead><TableHead>Valor previsto</TableHead></TableRow></TableHeader><TableBody>{linhas.map((l) => <TableRow key={l.etapa}><TableCell className="font-medium">{l.etapa}</TableCell><TableCell>{l.quantidade}</TableCell><TableCell>{moeda(l.valor)}</TableCell></TableRow>)}</TableBody></Table></Card></div></>;
}

function Formularios({ dialogo, fechar, dados, salvar, salvando }: { dialogo: null | "cliente" | "oportunidade" | "proposta" | "atividade" | "contrato"; fechar: () => void; dados: ComercialDados; salvar: (v: { tabela: string; valores: Record<string, unknown>; auditoria: string; entidade: string }) => void; salvando: boolean }) {
  const [itens, setItens] = useState([{ funcao: "", quantidade: 1, jornada: "", escala: "", local: "", custo: 0 }]);
  const submit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const v = Object.fromEntries(form.entries());
    if (dialogo === "cliente") salvar({ tabela: "com_clientes", entidade: "cliente", auditoria: "criou", valores: { ...v, cnpj: String(v["cnpj"]).replace(/\D/g, "") || null } });
    if (dialogo === "oportunidade") { const etapa = dados.etapas.find((x) => x.id === v["etapa_id"]); salvar({ tabela: "com_oportunidades", entidade: "oportunidade", auditoria: "criou", valores: { ...v, valor_previsto: Number(v["valor_previsto"]), probabilidade: etapa?.probabilidade ?? 0 } }); }
    if (dialogo === "atividade") salvar({ tabela: "com_atividades", entidade: "atividade", auditoria: "criou", valores: v });
    if (dialogo === "contrato") salvar({ tabela: "com_contratos", entidade: "contrato", auditoria: "criou", valores: { ...v, valor_mensal: Number(v["valor_mensal"]) } });
    if (dialogo === "proposta") {
      const { data: auth } = await supabase.auth.getUser(); if (!auth.user) { toast.error("Sua sessão expirou."); return; }
      const custo = itens.reduce((s, i) => s + Number(i.custo) * Number(i.quantidade), 0); const margem = Number(v["margem_percentual"]); const impostos = Number(v["impostos_percentual"]); const valor = custo * (1 + margem / 100 + impostos / 100);
      const { data: proposta, error } = await banco.from("com_propostas").insert({ oportunidade_id: v["oportunidade_id"], numero: v["numero"], valor_mensal: valor, prazo_meses: Number(v["prazo_meses"]), validade_ate: v["validade_ate"] || null, responsavel_id: auth.user.id, created_by: auth.user.id }).select("id").single();
      if (error) { toast.error(error.message); return; }
      const { error: versaoErro } = await banco.from("com_proposta_versoes").insert({ proposta_id: proposta.id, versao: 1, itens, custo_total: custo, margem_percentual: margem, impostos_percentual: impostos, valor_mensal: valor, observacoes: v["observacoes"], criado_por: auth.user.id });
      if (versaoErro) { toast.error(versaoErro.message); return; } await registrarAuditoria("criou_versao", "proposta", proposta.id, { versao: 1 }); fechar(); window.location.reload();
      return;
    }
    return;
  };
  return <Dialog open={!!dialogo} onOpenChange={(o) => !o && fechar()}><DialogContent className="max-w-3xl border-border bg-background text-foreground"><DialogHeader><DialogTitle>Novo {dialogo}</DialogTitle><DialogDescription>Preencha os dados do registro comercial.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2">{dialogo === "cliente" && <><Campo rotulo="Razão social"><Input name="razao_social" required /></Campo><Campo rotulo="Nome fantasia"><Input name="nome_fantasia" /></Campo><Campo rotulo="CNPJ"><Input name="cnpj" inputMode="numeric" /></Campo><Campo rotulo="Tipo"><Select name="tipo" defaultValue="potencial"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="potencial">Potencial cliente</SelectItem><SelectItem value="cliente">Cliente</SelectItem></SelectContent></Select></Campo><Campo rotulo="Telefone"><Input name="telefone" /></Campo><Campo rotulo="E-mail"><Input name="email" type="email" /></Campo><Campo rotulo="Segmento"><Input name="segmento" /></Campo><Campo rotulo="Origem do lead"><Input name="origem_lead" placeholder="Indicação, Google Maps..." /></Campo><Campo rotulo="Endereço"><Input name="endereco" /></Campo><Campo rotulo="Cidade"><Input name="cidade" /></Campo><Campo rotulo="UF"><Input name="uf" maxLength={2} /></Campo></>}
      {dialogo === "oportunidade" && <><Campo rotulo="Título"><Input name="titulo" required /></Campo><Campo rotulo="Cliente"><Select name="cliente_id" required><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{dados.clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>)}</SelectContent></Select></Campo><Campo rotulo="Etapa">{dados.etapas[0] && <Select name="etapa_id" defaultValue={dados.etapas[0].id}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{dados.etapas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select>}</Campo><Campo rotulo="Valor previsto"><Input name="valor_previsto" type="number" min="0" step="0.01" required /></Campo><Campo rotulo="Previsão de fechamento"><Input name="previsao_fechamento" type="date" /></Campo></>}
      {dialogo === "atividade" && <><Campo rotulo="Título"><Input name="titulo" required /></Campo><Campo rotulo="Tipo"><Select name="tipo" defaultValue="tarefa"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["tarefa","reuniao","retorno","lembrete"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Campo><Campo rotulo="Data e horário"><Input name="inicio_em" type="datetime-local" required /></Campo><Campo rotulo="Cliente"><Select name="cliente_id"><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent>{dados.clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>)}</SelectContent></Select></Campo><div className="sm:col-span-2"><Campo rotulo="Descrição"><Textarea name="descricao" /></Campo></div></>}
      {dialogo === "contrato" && <><Campo rotulo="Número"><Input name="numero" required /></Campo><Campo rotulo="Proposta aprovada"><Select name="proposta_id" required><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{dados.propostas.filter((p) => p.status === "aprovada").map((p) => <SelectItem key={p.id} value={p.id}>{p.numero}</SelectItem>)}</SelectContent></Select></Campo><Campo rotulo="Cliente"><Select name="cliente_id" required><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{dados.clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>)}</SelectContent></Select></Campo><Campo rotulo="Valor mensal"><Input name="valor_mensal" type="number" min="0" step="0.01" required /></Campo><Campo rotulo="Início"><Input name="inicio" type="date" required /></Campo><Campo rotulo="Fim"><Input name="fim" type="date" required /></Campo><Campo rotulo="Índice de reajuste"><Input name="indice_reajuste" placeholder="IPCA" /></Campo><Campo rotulo="Próximo reajuste"><Input name="proximo_reajuste" type="date" /></Campo></>}
      {dialogo === "proposta" && <><Campo rotulo="Número"><Input name="numero" required placeholder="PROP-2026-001" /></Campo><Campo rotulo="Oportunidade"><Select name="oportunidade_id" required><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{dados.oportunidades.map((o) => <SelectItem key={o.id} value={o.id}>{o.titulo}</SelectItem>)}</SelectContent></Select></Campo><Campo rotulo="Prazo contratual"><Input name="prazo_meses" type="number" defaultValue="12" min="1" required /></Campo><Campo rotulo="Validade"><Input name="validade_ate" type="date" /></Campo><Campo rotulo="Margem (%)"><Input name="margem_percentual" type="number" defaultValue="15" min="0" step="0.01" required /></Campo><Campo rotulo="Impostos (%)"><Input name="impostos_percentual" type="number" defaultValue="12" min="0" step="0.01" required /></Campo><div className="space-y-2 sm:col-span-2"><Label>Postos e funções</Label>{itens.map((item, index) => <div key={index} className="grid gap-2 border border-border p-3 sm:grid-cols-6"><Input placeholder="Função" value={item.funcao} onChange={(e) => setItens((a) => a.map((x, i) => i === index ? {...x, funcao: e.target.value} : x))} required /><Input type="number" min="1" value={item.quantidade} onChange={(e) => setItens((a) => a.map((x, i) => i === index ? {...x, quantidade: Number(e.target.value)} : x))} aria-label="Quantidade" /><Input placeholder="Jornada" value={item.jornada} onChange={(e) => setItens((a) => a.map((x, i) => i === index ? {...x, jornada: e.target.value} : x))} /><Input placeholder="Escala" value={item.escala} onChange={(e) => setItens((a) => a.map((x, i) => i === index ? {...x, escala: e.target.value} : x))} /><Input placeholder="Local" value={item.local} onChange={(e) => setItens((a) => a.map((x, i) => i === index ? {...x, local: e.target.value} : x))} /><Input type="number" min="0" step="0.01" placeholder="Custo" value={item.custo} onChange={(e) => setItens((a) => a.map((x, i) => i === index ? {...x, custo: Number(e.target.value)} : x))} /></div>)}<Button type="button" variant="outline" size="sm" onClick={() => setItens((a) => [...a, { funcao: "", quantidade: 1, jornada: "", escala: "", local: "", custo: 0 }])}><Plus />Adicionar item</Button></div><div className="sm:col-span-2"><Campo rotulo="Observações"><Textarea name="observacoes" /></Campo><p className="mt-2 text-right text-sm text-muted-foreground">Prévia: {moeda(itens.reduce((s, i) => s + i.custo * i.quantidade, 0))} antes de margem e impostos</p></div></>}
      </div><DialogFooter><Button type="button" variant="outline" onClick={fechar}>Cancelar</Button><Button disabled={salvando} className="bg-primary text-foreground hover:bg-primary/90">{salvando && <Loader2 className="animate-spin" />}Salvar</Button></DialogFooter></form></DialogContent></Dialog>;
}