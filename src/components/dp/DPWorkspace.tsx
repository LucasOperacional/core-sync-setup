import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, RefreshCw, Save, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  brl,
  calcularFerias,
  calcularFolha,
  calcularVa,
  calcularVt,
  somarDias,
  type DadosPagamento,
  type ResultadoFolha,
  type ResumoPontoMes,
} from "@/lib/dp-calculos";

export type ModoDP = "ferias" | "vt" | "va" | "folha" | "esocial";

const TITULOS: Record<ModoDP, [string, string]> = {
  ferias: ["Férias", "Programação, cálculo e recibo de férias."],
  vt: ["Cálculo do vale transporte", "Tarifa × viagens × dias trabalhados no ponto, com desconto de até 6%."],
  va: ["Cálculo do vale alimentação", "Valor diário × dias com presença no ponto."],
  folha: ["Folha de pagamento", "Horas extras, adicional noturno, faltas e atrasos vindos do ponto digital."],
  esocial: ["eSocial", "Eventos de remuneração e férias gerados a partir da folha."],
};

interface Func { id: string; nome: string; matricula: string | null; cpf: string | null; cargo: string | null; company_id: string | null; admissao: string | null }
type Dados = DadosPagamento & { employee_id: string };
const PADRAO: DadosPagamento = { salario: 0, dependentes: 0, vt_optante: true, vt_tarifa: 0, vt_viagens_dia: 2, va_valor_dia: 0 };

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

async function carregarBase(competencia: string) {
  const inicio = `${competencia}-01`;
  const [a, m] = competencia.split("-").map(Number);
  const fim = new Date(a!, m!, 0).toISOString().slice(0, 10);
  const [funcs, dados, resumos, faltas, folhas, ferias, eventos, empresas] = await Promise.all([
    supabase.from("pnt_employees").select("id, nome, matricula, cpf, cargo, company_id, admissao").eq("ativo", true).order("nome"),
    supabase.from("dp_dados_funcionario").select("*"),
    supabase.from("pnt_daily_summaries").select("employee_id, data, trabalhado_min, extra_min, noturno_min, atraso_min").gte("data", inicio).lte("data", fim),
    supabase.from("pnt_absences").select("employee_id, data, justificada").gte("data", inicio).lte("data", fim),
    supabase.from("dp_folhas").select("*").eq("competencia", competencia),
    supabase.from("dp_ferias").select("*").order("inicio", { ascending: false }),
    supabase.from("dp_esocial_eventos").select("id, evento, competencia, employee_id, status, recibo, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("pnt_companies").select("id, nome, cnpj"),
  ]);
  const erro = funcs.error ?? dados.error ?? resumos.error;
  if (erro) throw erro;
  const ponto = new Map<string, ResumoPontoMes>();
  for (const f of funcs.data ?? []) ponto.set(f.id, { diasTrabalhados: 0, extraMin: 0, noturnoMin: 0, atrasoMin: 0, faltas: 0 });
  for (const r of resumos.data ?? []) {
    const p = ponto.get(r.employee_id);
    if (!p) continue;
    if ((r.trabalhado_min ?? 0) > 0) p.diasTrabalhados++;
    p.extraMin += r.extra_min ?? 0;
    p.noturnoMin += r.noturno_min ?? 0;
    p.atrasoMin += r.atraso_min ?? 0;
  }
  for (const f of faltas.data ?? []) {
    const p = ponto.get(f.employee_id);
    if (p && !f.justificada) p.faltas++;
  }
  const mapaDados = new Map<string, DadosPagamento>();
  for (const d of (dados.data ?? []) as Dados[]) mapaDados.set(d.employee_id, { ...PADRAO, ...d, salario: Number(d.salario), vt_tarifa: Number(d.vt_tarifa), va_valor_dia: Number(d.va_valor_dia) });
  return {
    funcionarios: (funcs.data ?? []) as Func[],
    dados: mapaDados,
    ponto,
    folhas: folhas.data ?? [],
    ferias: ferias.data ?? [],
    eventos: eventos.data ?? [],
    empresas: empresas.data ?? [],
  };
}

export function DPWorkspace({ modo }: { modo: ModoDP }) {
  const [competencia, setCompetencia] = useState(mesAtual());
  const [editando, setEditando] = useState<Func | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dp", competencia], queryFn: () => carregarBase(competencia), staleTime: 60_000 });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["dp"] });
  const [titulo, desc] = TITULOS[modo];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Departamento pessoal</p>
          <h1 className="text-2xl md:text-3xl">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="comp">Competência</Label>
            <Input id="comp" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <Button variant="outline" onClick={recarregar}><RefreshCw className="size-4" /> Atualizar</Button>
        </div>
      </header>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando dados do ponto…</p>}
      {q.error && <p className="text-sm text-destructive">Não foi possível carregar: {(q.error as Error).message}. Somente RH e administradores têm acesso.</p>}
      {q.data && q.data.funcionarios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum funcionário ativo no Ponto Nxs.</p>}
      {q.data && q.data.funcionarios.length > 0 && (
        <>
          {modo === "vt" && <ModoVT base={q.data} onEditar={setEditando} />}
          {modo === "va" && <ModoVA base={q.data} onEditar={setEditando} />}
          {modo === "folha" && <ModoFolha base={q.data} competencia={competencia} onEditar={setEditando} onSalvo={recarregar} />}
          {modo === "ferias" && <ModoFerias base={q.data} onEditar={setEditando} onSalvo={recarregar} />}
          {modo === "esocial" && <ModoESocial base={q.data} competencia={competencia} onSalvo={recarregar} />}
        </>
      )}

      {editando && q.data && (
        <DadosDialog func={editando} atual={q.data.dados.get(editando.id) ?? PADRAO} onFechar={() => setEditando(null)} onSalvo={recarregar} />
      )}
    </div>
  );
}

type Base = Awaited<ReturnType<typeof carregarBase>>;

function BotaoDados({ f, onEditar }: { f: Func; onEditar: (f: Func) => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => onEditar(f)} title="Salário e benefícios">
      <Settings2 className="size-4" />
    </Button>
  );
}

function Tabela({ cab, linhas }: { cab: string[]; linhas: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>{cab.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t">{l.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Resumo({ itens }: { itens: [string, string][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {itens.map(([k, v]) => (
        <Card key={k}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="text-xl font-semibold">{v}</p></CardContent></Card>
      ))}
    </div>
  );
}

function ModoVT({ base, onEditar }: { base: Base; onEditar: (f: Func) => void }) {
  const linhas = base.funcionarios.map((f) => {
    const d = base.dados.get(f.id) ?? PADRAO;
    return { f, d, vt: calcularVt(d, base.ponto.get(f.id)!.diasTrabalhados) };
  });
  const tot = linhas.reduce((s, l) => ({ c: s.c + l.vt.custo, d: s.d + l.vt.desconto }), { c: 0, d: 0 });
  return (
    <>
      <Resumo itens={[["Custo total", brl(tot.c)], ["Desconto funcionários", brl(tot.d)], ["Custo da empresa", brl(tot.c - tot.d)], ["Funcionários", String(linhas.length)]]} />
      <Tabela
        cab={["Funcionário", "Dias no ponto", "Tarifa", "Viagens/dia", "Custo", "Desconto 6%", "Empresa", ""]}
        linhas={linhas.map(({ f, d, vt }) => [f.nome, vt.dias, brl(d.vt_tarifa), d.vt_optante ? d.vt_viagens_dia : "Não optante", brl(vt.custo), brl(vt.desconto), brl(vt.empresa), <BotaoDados f={f} onEditar={onEditar} />])}
      />
    </>
  );
}

function ModoVA({ base, onEditar }: { base: Base; onEditar: (f: Func) => void }) {
  const linhas = base.funcionarios.map((f) => {
    const d = base.dados.get(f.id) ?? PADRAO;
    const p = base.ponto.get(f.id)!;
    return { f, d, p, va: calcularVa(d, p.diasTrabalhados) };
  });
  const tot = linhas.reduce((s, l) => s + l.va.valor, 0);
  return (
    <>
      <Resumo itens={[["Total do mês", brl(tot)], ["Funcionários", String(linhas.length)], ["Faltas no mês", String(linhas.reduce((s, l) => s + l.p.faltas, 0))], ["Dias trabalhados", String(linhas.reduce((s, l) => s + l.va.dias, 0))]]} />
      <Tabela
        cab={["Funcionário", "Dias com presença", "Faltas", "Valor/dia", "Total", ""]}
        linhas={linhas.map(({ f, d, p, va }) => [f.nome, va.dias, p.faltas, brl(d.va_valor_dia), brl(va.valor), <BotaoDados f={f} onEditar={onEditar} />])}
      />
    </>
  );
}

async function holeritePdf(f: Func, competencia: string, r: ResultadoFolha, empresa?: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Recibo de pagamento de salário", 14, 16);
  doc.setFontSize(10);
  doc.text(`${empresa ?? ""}`, 14, 23);
  doc.text(`Funcionário: ${f.nome}   Matrícula: ${f.matricula ?? "-"}   Cargo: ${f.cargo ?? "-"}`, 14, 29);
  doc.text(`Competência: ${competencia.split("-").reverse().join("/")}`, 14, 35);
  autoTable(doc, {
    startY: 40,
    head: [["Descrição", "Referência", "Proventos", "Descontos"]],
    body: r.rubricas.map((x) => [x.descricao, x.referencia, x.provento ? brl(x.provento) : "", x.desconto ? brl(x.desconto) : ""]),
    foot: [["Totais", "", brl(r.proventos), brl(r.descontos)], ["Líquido a receber", "", "", brl(r.liquido)]],
  });
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.text(`Base INSS: ${brl(r.bruto)}   FGTS do mês: ${brl(r.fgts)}   Vale alimentação: ${brl(r.va.valor)}`, 14, y);
  doc.text("______________________________________", 14, y + 22);
  doc.text("Assinatura do funcionário", 14, y + 28);
  doc.save(`holerite-${f.nome.replace(/\s+/g, "-")}-${competencia}.pdf`);
}

function ModoFolha({ base, competencia, onEditar, onSalvo }: { base: Base; competencia: string; onEditar: (f: Func) => void; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const linhas = useMemo(
    () => base.funcionarios.map((f) => ({ f, r: calcularFolha(base.dados.get(f.id) ?? PADRAO, base.ponto.get(f.id)!) })),
    [base],
  );
  const salvas = new Map(base.folhas.map((x) => [x.employee_id, x]));
  const tot = linhas.reduce((s, l) => ({ b: s.b + l.r.proventos, l: s.l + l.r.liquido, f: s.f + l.r.fgts, i: s.i + l.r.inss }), { b: 0, l: 0, f: 0, i: 0 });
  const semSalario = linhas.filter((l) => !(base.dados.get(l.f.id)?.salario)).length;
  const empresaDe = (f: Func) => base.empresas.find((e) => e.id === f.company_id)?.nome;

  async function fechar() {
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("dp_folhas").upsert(
      linhas.map(({ f, r }) => ({ competencia, employee_id: f.id, dados: JSON.parse(JSON.stringify(r)), liquido: r.liquido, status: "fechada", created_by: u.user?.id ?? null, updated_at: new Date().toISOString() })),
      { onConflict: "competencia,employee_id" },
    );
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Folha salva com os dados atuais do ponto.");
    onSalvo();
  }

  return (
    <>
      <Resumo itens={[["Total de proventos", brl(tot.b)], ["Total líquido", brl(tot.l)], ["INSS funcionários", brl(tot.i)], ["FGTS a recolher", brl(tot.f)]]} />
      {semSalario > 0 && <p className="text-sm text-muted-foreground">{semSalario} funcionário(s) sem salário cadastrado — clique na engrenagem para informar.</p>}
      <div className="flex justify-end">
        <Button onClick={fechar} disabled={salvando}><Save className="size-4" /> {salvando ? "Salvando…" : "Salvar folha da competência"}</Button>
      </div>
      <Tabela
        cab={["Funcionário", "Dias", "Extras", "Faltas", "Proventos", "INSS", "IRRF", "Líquido", "Situação", ""]}
        linhas={linhas.map(({ f, r }) => [
          f.nome,
          r.ponto.diasTrabalhados,
          `${Math.floor(r.ponto.extraMin / 60)}h${String(r.ponto.extraMin % 60).padStart(2, "0")}`,
          r.ponto.faltas,
          brl(r.proventos),
          brl(r.inss),
          brl(r.irrf),
          <strong>{brl(r.liquido)}</strong>,
          salvas.get(f.id) ? "Salva" : "Prévia",
          <div className="flex">
            <Button size="sm" variant="ghost" title="Holerite em PDF" onClick={() => holeritePdf(f, competencia, r, empresaDe(f))}><FileText className="size-4" /></Button>
            <BotaoDados f={f} onEditar={onEditar} />
          </div>,
        ])}
      />
    </>
  );
}

function ModoFerias({ base, onEditar, onSalvo }: { base: Base; onEditar: (f: Func) => void; onSalvo: () => void }) {
  const [func, setFunc] = useState("");
  const [inicio, setInicio] = useState("");
  const [dias, setDias] = useState(30);
  const [abono, setAbono] = useState(0);
  const [aqIni, setAqIni] = useState("");
  const f = base.funcionarios.find((x) => x.id === func);
  const d = f ? base.dados.get(f.id) ?? PADRAO : null;
  const calc = d ? calcularFerias(d, dias, abono) : null;
  const nome = (id: string) => base.funcionarios.find((x) => x.id === id)?.nome ?? "—";

  async function salvar() {
    if (!f || !calc || !inicio || !aqIni) { toast.error("Preencha funcionário, período aquisitivo e início."); return; }
    if (dias + abono > 30) { toast.error("Dias de férias + abono não podem passar de 30."); return; }
    if (abono > 10) { toast.error("O abono é de no máximo 10 dias."); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("dp_ferias").insert({
      employee_id: f.id, aquisitivo_inicio: aqIni, aquisitivo_fim: somarDias(aqIni, 364), inicio, dias, abono_dias: abono,
      valores: calc, created_by: u.user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Férias programadas.");
    onSalvo();
  }
  async function excluir(id: string) {
    const { error } = await supabase.from("dp_ferias").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onSalvo();
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Programar férias</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Funcionário</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={func} onChange={(e) => { setFunc(e.target.value); const a = base.funcionarios.find((x) => x.id === e.target.value)?.admissao; if (a) setAqIni(a); }}>
              <option value="">Selecione…</option>
              {base.funcionarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>
          <div><Label>Início aquisitivo</Label><Input type="date" value={aqIni} onChange={(e) => setAqIni(e.target.value)} /></div>
          <div><Label>Início das férias</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div><Label>Dias</Label><Input type="number" min={5} max={30} value={dias} onChange={(e) => setDias(Number(e.target.value))} /></div>
          <div><Label>Abono (dias)</Label><Input type="number" min={0} max={10} value={abono} onChange={(e) => setAbono(Number(e.target.value))} /></div>
          {f && d && calc && (
            <div className="md:col-span-6 space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
              {!d.salario && <p className="text-destructive">Sem salário cadastrado. <button className="underline" onClick={() => onEditar(f)}>Informar agora</button></p>}
              <p>Retorno: <strong>{inicio ? somarDias(inicio, dias).split("-").reverse().join("/") : "—"}</strong> · Pagamento até 2 dias antes do início.</p>
              <p>Férias {brl(calc.ferias)} + 1/3 {brl(calc.terco)} + abono {brl(calc.abono)} + 1/3 abono {brl(calc.tercoAbono)} − INSS {brl(calc.inss)} − IRRF {brl(calc.irrf)} = <strong>{brl(calc.liquido)}</strong></p>
            </div>
          )}
          <div className="md:col-span-6 flex justify-end"><Button onClick={salvar}><Save className="size-4" /> Programar</Button></div>
        </CardContent>
      </Card>
      <Tabela
        cab={["Funcionário", "Aquisitivo", "Início", "Dias", "Abono", "Líquido", ""]}
        linhas={base.ferias.map((x) => [
          nome(x.employee_id),
          `${x.aquisitivo_inicio.split("-").reverse().join("/")} a ${x.aquisitivo_fim.split("-").reverse().join("/")}`,
          x.inicio.split("-").reverse().join("/"),
          x.dias,
          x.abono_dias,
          brl(Number((x.valores as { liquido?: number })?.liquido ?? 0)),
          <Button size="sm" variant="ghost" onClick={() => excluir(x.id)}><Trash2 className="size-4" /></Button>,
        ])}
      />
    </>
  );
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function xmlS1200(f: Func, cnpj: string, competencia: string, r: ResultadoFolha) {
  const id = `ID1${soDigitos(cnpj).slice(0, 8).padEnd(14, "0")}${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
  const itens = r.rubricas.map((x, i) => `<itensRemun><codRubr>${i + 1}</codRubr><ideTabRubr>DP</ideTabRubr><vrRubr>${(x.provento || x.desconto).toFixed(2)}</vrRubr><indApurIR>0</indApurIR></itensRemun>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00"><evtRemun Id="${id}"><ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${competencia}</perApur><tpAmb>1</tpAmb><procEmi>1</procEmi><verProc>NXS-1.0</verProc></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${soDigitos(cnpj).slice(0, 8)}</nrInsc></ideEmpregador><ideTrabalhador><cpfTrab>${soDigitos(f.cpf)}</cpfTrab></ideTrabalhador><dmDev><ideDmDev>${esc(competencia)}-${esc(f.matricula ?? f.id.slice(0, 8))}</ideDmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${soDigitos(cnpj)}</nrInsc><codLotacao>01</codLotacao><remunPerApur><matricula>${esc(f.matricula ?? "")}</matricula>${itens}</remunPerApur></ideEstabLot></infoPerApur></dmDev></evtRemun></eSocial>`;
}

function ModoESocial({ base, competencia, onSalvo }: { base: Base; competencia: string; onSalvo: () => void }) {
  const [gerando, setGerando] = useState(false);
  const nome = (id: string | null) => base.funcionarios.find((x) => x.id === id)?.nome ?? "—";
  const pendencias = base.funcionarios.filter((f) => !soDigitos(f.cpf) || !base.empresas.find((e) => e.id === f.company_id)?.cnpj);

  async function gerar() {
    if (base.folhas.length === 0) { toast.error("Salve a folha desta competência antes de gerar os eventos."); return; }
    setGerando(true);
    const { data: u } = await supabase.auth.getUser();
    const registros = base.folhas.flatMap((fl) => {
      const f = base.funcionarios.find((x) => x.id === fl.employee_id);
      const cnpj = base.empresas.find((e) => e.id === f?.company_id)?.cnpj;
      if (!f || !cnpj || !soDigitos(f.cpf)) return [];
      return [{ evento: "S-1200", competencia, employee_id: f.id, xml: xmlS1200(f, cnpj, competencia, fl.dados as unknown as ResultadoFolha), created_by: u.user?.id ?? null }];
    });
    const { error } = registros.length ? await supabase.from("dp_esocial_eventos").insert(registros) : { error: null };
    setGerando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${registros.length} evento(s) S-1200 gerado(s).`);
    onSalvo();
  }
  async function baixar(id: string, evento: string) {
    const { data, error } = await supabase.from("dp_esocial_eventos").select("xml").eq("id", id).single();
    if (error) { toast.error(error.message); return; }
    const url = URL.createObjectURL(new Blob([data.xml], { type: "application/xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${evento}-${id.slice(0, 8)}.xml`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p><strong>Transmissão ao governo:</strong> aguardando o certificado digital A1 da empresa. Até lá, os eventos ficam gerados aqui para download e envio pelo portal.</p>
          {pendencias.length > 0 && <p className="text-destructive">{pendencias.length} funcionário(s) sem CPF ou empresa sem CNPJ não entram nos eventos: {pendencias.slice(0, 5).map((f) => f.nome).join(", ")}{pendencias.length > 5 ? "…" : ""}</p>}
          <div className="flex justify-end"><Button onClick={gerar} disabled={gerando}>{gerando ? "Gerando…" : "Gerar S-1200 da competência"}</Button></div>
        </CardContent>
      </Card>
      <Tabela
        cab={["Evento", "Competência", "Funcionário", "Situação", "Recibo", "Gerado em", ""]}
        linhas={base.eventos.map((e) => [e.evento, e.competencia ?? "—", nome(e.employee_id), e.status, e.recibo ?? "—", new Date(e.created_at).toLocaleString("pt-BR"),
          <Button size="sm" variant="ghost" onClick={() => baixar(e.id, e.evento)}><Download className="size-4" /></Button>])}
      />
    </>
  );
}

function DadosDialog({ func, atual, onFechar, onSalvo }: { func: Func; atual: DadosPagamento; onFechar: () => void; onSalvo: () => void }) {
  const [d, setD] = useState<DadosPagamento>(atual);
  const campo = (k: keyof DadosPagamento, rotulo: string, passo = "0.01") => (
    <div><Label>{rotulo}</Label><Input type="number" step={passo} value={String(d[k])} onChange={(e) => setD({ ...d, [k]: Number(e.target.value) })} /></div>
  );
  async function salvar() {
    const { error } = await supabase.from("dp_dados_funcionario").upsert({ employee_id: func.id, ...d, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success("Dados salvos.");
    onSalvo();
    onFechar();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{func.nome}</DialogTitle><DialogDescription>Salário e benefícios usados na folha, férias e vales.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {campo("salario", "Salário base (R$)")}
          {campo("dependentes", "Dependentes (IR)", "1")}
          {campo("vt_tarifa", "Tarifa da passagem (R$)")}
          {campo("vt_viagens_dia", "Viagens por dia", "1")}
          {campo("va_valor_dia", "Vale alimentação por dia (R$)")}
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={d.vt_optante} onChange={(e) => setD({ ...d, vt_optante: e.target.checked })} /> Optante do vale transporte</label>
        </div>
        <div className="flex justify-end"><Button onClick={salvar}><Save className="size-4" /> Salvar</Button></div>
      </DialogContent>
    </Dialog>
  );
}
