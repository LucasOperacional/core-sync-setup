import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Save, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buscarLeadsMaps } from "@/lib/prospeccao-maps.functions";
import { enriquecerLead, type DadosEnriquecidos } from "@/lib/extrator-leads.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/extrator-leads")({
  head: () => ({
    meta: [
      { title: "Extrator de Leads | Comercial NXS" },
      { name: "description", content: "Extraia nome, telefone, e-mail, CNPJ e endereço de empresas para prospecção." },
      { property: "og:title", content: "Extrator de Leads | Comercial NXS" },
      { property: "og:description", content: "Leads completos com dados públicos de contato e da Receita." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExtratorLeads,
});

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  site: string;
  endereco: string;
  categoria: string;
  cnpjInformado: string;
  dados?: DadosEnriquecidos;
  status: "novo" | "buscando" | "ok" | "erro";
};

const fmtCnpj = (c: string | null | undefined) =>
  c ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";

function ExtratorLeads() {
  const buscar = useServerFn(buscarLeadsMaps);
  const enriquecer = useServerFn(enriquecerLead);
  const [consulta, setConsulta] = useState("");
  const [limite, setLimite] = useState(40);
  const [cnpjs, setCnpjs] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const atualizar = (id: string, p: Partial<Lead>) =>
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  async function buscarMaps() {
    if (consulta.trim().length < 2) return;
    setBuscando(true);
    try {
      const r = await buscar({ data: { consulta, limite, regioes: [] } });
      setLeads(r.leads.map((l) => ({
        id: l.id, nome: l.nome, telefone: l.telefone, site: l.site,
        endereco: l.endereco, categoria: l.categoria, cnpjInformado: "", status: "novo",
      })));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  function adicionarCnpjs() {
    const lista = cnpjs.split(/[\s,;]+/).map((c) => c.replace(/\D/g, "")).filter((c) => c.length === 14);
    if (!lista.length) {
      toast.error("Informe CNPJs com 14 dígitos.");
      return;
    }
    setLeads((ls) => [
      ...ls,
      ...lista.map((c) => ({
        id: `cnpj-${c}`, nome: fmtCnpj(c), telefone: "", site: "", endereco: "",
        categoria: "", cnpjInformado: c, status: "novo" as const,
      })),
    ]);
    setCnpjs("");
  }

  async function extrairTodos() {
    setExtraindo(true);
    const fila = leads.filter((l) => l.status !== "ok");
    let i = 0;
    const trabalhador = async () => {
      while (i < fila.length) {
        const l = fila[i++]!;
        atualizar(l.id, { status: "buscando" });
        try {
          const d = await enriquecer({ data: { site: l.site, cnpj: l.cnpjInformado } });
          atualizar(l.id, {
            dados: d,
            status: "ok",
            nome: l.cnpjInformado ? d.nomeFantasia || d.razaoSocial || l.nome : l.nome,
          });
        } catch {
          atualizar(l.id, { status: "erro" });
        }
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    setExtraindo(false);
    toast.success("Extração concluída.");
  }

  const linha = (l: Lead) => ({
    nome: l.nome,
    razao: l.dados?.razaoSocial ?? "",
    cnpj: fmtCnpj(l.dados?.cnpj),
    telefone: [l.telefone, l.dados?.telefoneReceita, ...(l.dados?.telefones ?? [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" / "),
    email: (l.dados?.emails ?? []).join(" / "),
    endereco: l.dados?.enderecoReceita || l.endereco,
    socios: (l.dados?.socios ?? []).join(" / "),
    situacao: l.dados?.situacao ?? "",
    site: l.site,
  });

  function exportar() {
    const cab = ["Nome", "Razão social", "CNPJ", "Telefones", "E-mails", "Endereço", "Sócios", "Situação", "Site"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const corpo = leads.map((l) => Object.values(linha(l)).map(esc).join(";"));
    const blob = new Blob(["\uFEFF" + [cab.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${Date.now()}.csv`;
    a.click();
  }

  async function salvarClientes() {
    setSalvando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      const registros = leads.map((l) => {
        const x = linha(l);
        return {
          tipo: "potencial",
          razao_social: x.razao || l.nome,
          nome_fantasia: l.dados?.nomeFantasia || l.nome,
          cnpj: l.dados?.cnpj ?? null,
          email: l.dados?.emails[0] ?? null,
          telefone: x.telefone.split(" / ")[0] || null,
          endereco: x.endereco || null,
          segmento: l.categoria || null,
          origem_lead: "Extrator de Leads",
          responsavel_id: u.user!.id,
          ativo: true,
        };
      });
      const { error } = await (supabase as any).from("com_clientes").insert(registros);
      if (error) throw new Error(error.message);
      toast.success(`${registros.length} lead(s) salvos em Clientes.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Sparkles className="size-6 text-primary" /> Extrator de Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            Busque empresas ou cole CNPJs e extraia telefone, e-mail, CNPJ, endereço e sócios a partir de dados públicos (site da empresa e Receita Federal).
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Buscar empresas</CardTitle></CardHeader>
            <CardContent>
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void buscarMaps(); }}>
                <Input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Ex.: condomínios em Goiânia" className="flex-1" />
                <Input type="number" min={1} max={300} value={limite} onChange={(e) => setLimite(Math.min(300, Number(e.target.value) || 40))} className="sm:w-24" aria-label="Quantidade" />
                <Button type="submit" disabled={buscando}>
                  {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Buscar
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Consultar por CNPJ</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Input value={cnpjs} onChange={(e) => setCnpjs(e.target.value)} placeholder="Um ou mais CNPJs separados por vírgula" className="flex-1" />
              <Button variant="outline" onClick={adicionarCnpjs}>Adicionar</Button>
            </CardContent>
          </Card>
        </div>

        {leads.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{leads.length} lead(s)</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void extrairTodos()} disabled={extraindo}>
                  {extraindo ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Extrair dados
                </Button>
                <Button variant="outline" onClick={exportar}><Download className="size-4" /> Exportar CSV</Button>
                <Button variant="outline" onClick={() => void salvarClientes()} disabled={salvando}>
                  {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar em Clientes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">CNPJ</th>
                    <th className="py-2 pr-3">Telefones</th>
                    <th className="py-2 pr-3">E-mails</th>
                    <th className="py-2 pr-3">Endereço</th>
                    <th className="py-2">Sócios</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => {
                    const x = linha(l);
                    return (
                      <tr key={l.id} className="border-t border-border/60 align-top">
                        <td className="py-3 pr-3">
                          <span className="font-medium">{x.nome}</span>
                          {x.razao && x.razao !== x.nome && <span className="block text-xs text-muted-foreground">{x.razao}</span>}
                          <span className="block text-xs text-muted-foreground">
                            {l.status === "buscando" ? "Extraindo…" : l.status === "erro" ? "Falha na extração" : l.dados?.erro ?? x.situacao}
                          </span>
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap">{x.cnpj || "—"}</td>
                        <td className="py-3 pr-3">{x.telefone || "—"}</td>
                        <td className="py-3 pr-3 break-all">{x.email || "—"}</td>
                        <td className="py-3 pr-3 text-muted-foreground">{x.endereco || "—"}</td>
                        <td className="py-3 text-muted-foreground">{x.socios || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
