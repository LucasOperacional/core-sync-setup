import { useEffect, useMemo, useState } from "react";
import { Mail, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODELOS_VAGA,
  SOLICITACAO_VAZIA,
  SUGESTOES_HORARIO,
  SUGESTOES_JUSTIFICATIVA,
  carregarRascunho,
  salvarRascunho,
  type SolicitacaoVaga,
} from "@/lib/vagas-template";
import { gerarPdfSolicitacaoVaga, nomeArquivoSolicitacao } from "@/lib/vagas-pdf";
import { tipoSolicitacaoLabel } from "@/lib/vagas-email";

/** Destino fixo das solicitações de vaga (não é digitado no formulário). */
const EMAIL_DESTINO = "recrutamento@operacional.cloud";
import { enviarSolicitacaoVagaPorEmail } from "@/lib/vagas-envio.functions";
import { useServerFn } from "@tanstack/react-start";

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export function SolicitacaoVagaForm() {
  const [dados, setDados] = useState<SolicitacaoVaga>({
    ...SOLICITACAO_VAZIA,
    dataSolicitacao: hoje(),
  });
  const [modeloAtivo, setModeloAtivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [postos, setPostos] = useState<string[]>([]);
  const [carregandoPostos, setCarregandoPostos] = useState(true);
  const enviar = useServerFn(enviarSolicitacaoVagaPorEmail);

  useEffect(() => {
    const rascunho = carregarRascunho();
    if (rascunho) setDados(rascunho);
  }, []);

  // Preenche o fiscal responsável com o nome do usuário logado.
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      const nome = String(
        data.user.user_metadata?.["nome"] ?? data.user.email?.split("@")[0] ?? "",
      ).trim();
      if (!nome) return;
      setDados((atual) => ({
        ...atual,
        fiscalResponsavel: atual.fiscalResponsavel || nome,
      }));
    })();
  }, []);

  // Lista de postos + endereços cadastrados na NEXTI.
  useEffect(() => {
    let ativo = true;
    void (async () => {
      const nomes = new Set<string>();
      for (let pagina = 0; pagina < 10; pagina += 1) {
        const de = pagina * 1000;
        const { data, error } = await supabase
          .from("nexti_workplaces")
          .select("name,city,state,raw_payload")
          .order("name", { ascending: true })
          .range(de, de + 999);
        if (error) break;
        for (const p of data ?? []) {
          const nome = (p.name ?? "").trim();
          if (!nome) continue;
          const bruto = (p.raw_payload ?? {}) as Record<string, unknown>;
          const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
          const endereco = texto(bruto["address"]);
          const bairro = texto(bruto["district"]);
          const cidade = texto(bruto["cityName"]) || (p.city ?? "").trim();
          const uf = texto(bruto["federatedUnitInitials"]) || (p.state ?? "").trim();
          const partes = [endereco, bairro, [cidade, uf].filter(Boolean).join(" - ")].filter(
            Boolean,
          );
          const local = partes.join(", ");
          nomes.add(local ? `${nome} — ${local}` : nome);
        }
        if ((data?.length ?? 0) < 1000) break;
      }

      if (!ativo) return;
      setPostos([...nomes].sort((a, b) => a.localeCompare(b)));
      setCarregandoPostos(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  function set<K extends keyof SolicitacaoVaga>(campo: K, valor: SolicitacaoVaga[K]) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
  }

  function aplicarModelo(id: string) {
    const modelo = MODELOS_VAGA.find((m) => m.id === id);
    if (!modelo) return;
    setDados((atual) => ({ ...atual, ...modelo.dados }));
    setModeloAtivo(id);
    toast.success(`Modelo "${modelo.nome}" aplicado`, {
      description: "Campos preenchidos automaticamente. Ajuste o que for necessário.",
    });
  }

  const preenchimento = useMemo(() => {
    const obrigatorios: (keyof SolicitacaoVaga)[] = [
      "cargo",
      "departamentoPosto",
      "localidade",
      "salario",
      "horarioTrabalho",
      "dataInicio",
      "descricaoAtividade",
      "perfilDesejado",
      "solicitante",
    ];
    const ok = obrigatorios.filter((c) => String(dados[c]).trim().length > 0).length;
    return Math.round((ok / obrigatorios.length) * 100);
  }, [dados]);

  async function enviarPorEmail(automatico = false) {
    if (!dados.cargo.trim()) {
      if (!automatico) toast.error("Informe o cargo antes de enviar.");
      return false;
    }
    setEnviando(true);
    try {
      const bytes = await gerarPdfSolicitacaoVaga(dados);
      let binario = "";
      for (const b of bytes) binario += String.fromCharCode(b);
      const arquivo = nomeArquivoSolicitacao(dados);
      salvarRascunho(dados);

      const resultado = await enviar({
        data: {
          emailDestino: EMAIL_DESTINO,
          arquivo,
          pdfBase64: btoa(binario),
          cargo: dados.cargo,
          posto: dados.departamentoPosto,
          localidade: dados.localidade,
          salario: dados.salario,
          horario: dados.horarioTrabalho,
          dataInicio: dados.dataInicio,
          solicitante: dados.solicitante,
          fiscalResponsavel: dados.fiscalResponsavel,
          tipo: tipoSolicitacaoLabel(dados),
          justificativa: dados.justificativa,
          atividade: dados.descricaoAtividade,
          perfil: dados.perfilDesejado,
        },
      });

      if (!resultado.registrado) {
        toast.error("Não foi possível registrar a solicitação.");
        return false;
      }

      toast.success(
        automatico
          ? "Formulário completo — solicitação enviada para aprovação"
          : "Solicitação enviada para aprovação",
        {
          description:
            "Admin, Diretor ou Cordenador vão conferir a vaga. O e-mail sai automaticamente após a aprovação.",
        },
      );
      return true;
    } catch (erro) {
      toast.error("Não foi possível enviar a solicitação para aprovação.", {
        description: erro instanceof Error ? erro.message : "Tente novamente ou envie manualmente.",
      });
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wand2 className="size-5" />
            </span>
            <div className="flex-1">
              <CardTitle className="text-base">Preenchimento automático</CardTitle>
              <CardDescription className="text-xs">
                Escolha um modelo de vaga para preencher cargo, posto, benefícios, horário,
                atividades e perfil desejado conforme o template de Solicitação de Pessoas.
              </CardDescription>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {preenchimento}% preenchido
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {MODELOS_VAGA.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => aplicarModelo(m.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                modeloAtivo === m.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <Sparkles className="size-3.5" />
              {m.nome}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados da solicitação</CardTitle>
          <CardDescription className="text-xs">RE.DRU.03-SDP- · Rev.00</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cargo">Cargo</Label>
            <Input id="cargo" value={dados.cargo} onChange={(e) => set("cargo", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="candidato">Nome do candidato (uso do RH)</Label>
            <Input
              id="candidato"
              value={dados.nomeCandidato}
              onChange={(e) => set("nomeCandidato", e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tipo de solicitação</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { v: "reposicao" as const, l: "Reposição de vaga" },
                { v: "aumento" as const, l: "Aumento do quadro" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set("tipoSolicitacao", o.v)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    dados.tipoSolicitacao === o.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="substituido">Colaborador substituído</Label>
            <Input
              id="substituido"
              value={dados.colaboradorSubstituido}
              onChange={(e) => set("colaboradorSubstituido", e.target.value)}
              disabled={dados.tipoSolicitacao === "aumento"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dataInicio">Data de início</Label>
            <Input
              id="dataInicio"
              type="date"
              value={dados.dataInicio}
              onChange={(e) => set("dataInicio", e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="justificativa">Justificativa</Label>
            <Textarea
              id="justificativa"
              rows={3}
              value={dados.justificativa}
              onChange={(e) => set("justificativa", e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGESTOES_JUSTIFICATIVA.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("justificativa", s)}
                  className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-secondary-foreground hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identificação da vaga</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="posto">Depto / Posto</Label>
            <Input
              id="posto"
              list="postos-nexti"
              placeholder={
                carregandoPostos
                  ? "Carregando postos da NEXTI..."
                  : `Selecione ou digite (${postos.length} postos da NEXTI)`
              }
              value={dados.departamentoPosto}
              onChange={(e) => set("departamentoPosto", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sexo</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { v: "fem" as const, l: "Feminino" },
                { v: "masc" as const, l: "Masculino" },
                { v: "indiferente" as const, l: "Indiferente" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set("sexo", o.v)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    dados.sexo === o.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="localidade">Localidade / Ponto de referência</Label>
            <Input
              id="localidade"
              list="postos-nexti"
              placeholder={
                carregandoPostos
                  ? "Carregando postos da NEXTI..."
                  : `Selecione ou digite (${postos.length} postos da NEXTI)`
              }
              value={dados.localidade}
              onChange={(e) => set("localidade", e.target.value)}
            />
            <datalist id="postos-nexti">
              {postos.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="salario">Salário</Label>
            <Input
              id="salario"
              value={dados.salario}
              onChange={(e) => set("salario", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vt">Vale transporte</Label>
            <Input
              id="vt"
              value={dados.valeTransporte}
              onChange={(e) => set("valeTransporte", e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Benefícios</Label>
            <div className="flex flex-wrap gap-4">
              {[
                { k: "valeAlimentacao" as const, l: "V.A. da categoria" },
                { k: "planoSaude" as const, l: "Plano de saúde" },
                { k: "planoOdontologico" as const, l: "Plano odontológico" },
              ].map((b) => (
                <label key={b.k} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={dados[b.k]} onCheckedChange={(v) => set(b.k, Boolean(v))} />
                  {b.l}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gratificacao">Gratificação</Label>
            <Input
              id="gratificacao"
              value={dados.gratificacao}
              onChange={(e) => set("gratificacao", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="outros">Outros benefícios</Label>
            <Input
              id="outros"
              value={dados.outrosBeneficios}
              onChange={(e) => set("outrosBeneficios", e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="horario">Horário de trabalho</Label>
            <Input
              id="horario"
              value={dados.horarioTrabalho}
              onChange={(e) => set("horarioTrabalho", e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGESTOES_HORARIO.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("horarioTrabalho", s)}
                  className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-secondary-foreground hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="atividade">Descrição da atividade</Label>
            <Textarea
              id="atividade"
              rows={4}
              value={dados.descricaoAtividade}
              onChange={(e) => set("descricaoAtividade", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Perfil desejado e responsáveis</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="perfil">Requisitos do perfil</Label>
            <Textarea
              id="perfil"
              rows={4}
              value={dados.perfilDesejado}
              onChange={(e) => set("perfilDesejado", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fiscal">Fiscal responsável</Label>
            <Input
              id="fiscal"
              value={dados.fiscalResponsavel}
              onChange={(e) => set("fiscalResponsavel", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="solicitante">Quem está solicitando</Label>
            <Input
              id="solicitante"
              value={dados.solicitante}
              onChange={(e) => set("solicitante", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dataSolicitacao">Data</Label>
            <Input
              id="dataSolicitacao"
              type="date"
              value={dados.dataSolicitacao}
              onChange={(e) => set("dataSolicitacao", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coordenador">Coordenador operacional</Label>
            <Select
              value={dados.coordenadorOperacional}
              onValueChange={(v) => set("coordenadorOperacional", v)}
            >
              <SelectTrigger id="coordenador">
                <SelectValue placeholder="Selecione o coordenador operacional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VANDERLEI">VANDERLEI</SelectItem>
                <SelectItem value="JEFFERSON">JEFFERSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="size-5" />
            </span>
            <div className="flex-1">
              <CardTitle className="text-base">Enviar para aprovação</CardTitle>
              <CardDescription className="text-xs">
                A vaga vai para a página de aprovação de vagas. Depois de aprovada, o e-mail com o
                PDF oficial é enviado automaticamente.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button disabled={enviando} onClick={() => void enviarPorEmail(false)}>
            <Mail className="size-4" /> {enviando ? "Enviando..." : "Enviar para aprovação"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
