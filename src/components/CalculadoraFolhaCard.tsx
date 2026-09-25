import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BrainCircuit,
  Calculator,
  CalendarDays,
  CalendarRange,
  Clock,
  FileText,
  Loader2,
  Sparkles,
  Timer,
  Trash2,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calcularHorasExtras,
  extrairEscala,
  extrairNomeColaborador,
  extrairPeriodo,
  jornadaPadraoDaEscala,
  lerDiasDoTexto,
  limparCabecalho,
  limparRodape,
  minutosDoDia,
  minutosParaTexto,
  resumoCompleto,
  textoDePdf,
  type DiaFolha,
} from "@/lib/calculadora-folha";
import { lerFolhaComIA } from "@/lib/folha-ia.functions";
import { manusExecutarTarefa } from "@/lib/manus.functions";
import { loadManusConfig } from "@/lib/manus-ai";
import { supabase } from "@/integrations/supabase/client";

export function CalculadoraFolhaCard() {
  const [texto, setTexto] = useState("");
  const [dias, setDias] = useState<DiaFolha[]>([]);
  const [lendo, setLendo] = useState(false);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [fonte, setFonte] = useState<"local" | "ia">("local");
  const [escalaIA, setEscalaIA] = useState<string | null>(null);
  const [colaborador, setColaborador] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [avisosIA, setAvisosIA] = useState<string[]>([]);
  const [modeloIA, setModeloIA] = useState("");
  const [parecerManus, setParecerManus] = useState("");
  const [manusCarregando, setManusCarregando] = useState(false);
  const [importador, setImportador] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data, error }) => {
      const usuario = data.user;
      if (!usuario || error) return;
      const nome =
        (usuario.user_metadata?.["nome"] as string | undefined) ||
        (usuario.user_metadata?.["name"] as string | undefined) ||
        (usuario.user_metadata?.["full_name"] as string | undefined) ||
        usuario.email ||
        "Usuário";
      setImportador(nome);
    });
  }, []);

  const resumo = useMemo(() => resumoCompleto(dias, texto), [dias, texto]);
  const escala = escalaIA || resumo.escala;
  const jornadaPadrao = useMemo(() => jornadaPadraoDaEscala(escala), [escala]);
  const diasComMarcacao = resumo.dias.filter((d) => d.minutos > 0).length;
  const horasExtras = useMemo(
    () => calcularHorasExtras(resumo.dias, jornadaPadrao),
    [resumo.dias, jornadaPadrao],
  );
  const extrasPorDia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const e of horasExtras.porDia) mapa.set(e.dia, e.extras);
    return mapa;
  }, [horasExtras]);

  function limparIA() {
    setEscalaIA(null);
    setColaborador("");
    setPeriodo("");
    setAvisosIA([]);
    setModeloIA("");
    setParecerManus("");
  }

  function preencherIdentificacao(valor: string) {
    const nome = extrairNomeColaborador(valor);
    if (nome) setColaborador(nome);
    const escalaTxt = extrairEscala(valor);
    if (escalaTxt) setEscalaIA(escalaTxt);
    const per = extrairPeriodo(valor);
    if (per) setPeriodo(per);
  }

  function calcularLocal(valor = texto) {
    preencherIdentificacao(valor);
    const encontrados = lerDiasDoTexto(valor);
    setDias(encontrados);
    setFonte("local");
    if (!encontrados.length) {
      toast.error("Nenhum horário encontrado no conteúdo informado.");
      return false;
    }
    return true;
  }

  async function analisarComIA(valor = texto) {
    if (!valor.trim()) return;
    setAnalisandoIA(true);
    try {
      const resultado = await lerFolhaComIA({
        data: { texto: limparCabecalho(limparRodape(valor), { manterEscala: true }) },
      });
      const convertidos: DiaFolha[] = resultado.dias
        .filter((d) => d.horarios.length > 0)
        .map((d) => {
          const { minutos, observacao } = minutosDoDia(d.horarios);
          return {
            dia: d.dia,
            horarios: d.horarios,
            minutos,
            observacao: d.observacao || observacao,
          };
        });
      if (!convertidos.length) {
        toast.error("A IA não localizou dias com marcações nesta folha.");
        return;
      }
      setDias(convertidos);
      setFonte("ia");
      setEscalaIA(resultado.escala || null);
      setColaborador(resultado.colaborador);
      setPeriodo(resultado.periodo);
      setAvisosIA(resultado.observacoes);
      setModeloIA(resultado.modelo);
      toast.success(`Folha lida pela IA: ${convertidos.length} dia(s).`);
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : "Não foi possível analisar a folha com a IA.",
      );
    } finally {
      setAnalisandoIA(false);
    }
  }

  async function conferirComManus() {
    const config = loadManusConfig();
    if (!config.apiKey) {
      toast.error("Configure a chave da Manus AI na página de IA operacional.");
      return;
    }
    setManusCarregando(true);
    try {
      const linhas = resumo.dias
        .map(
          (d) =>
            `${d.dia}: ${d.horarios.join(" ") || "sem marcação"} = ${minutosParaTexto(d.minutos)}${
              d.observacao ? ` (${d.observacao})` : ""
            }`,
        )
        .join("\n");
      const prompt = `Confira o cálculo desta folha de ponto brasileira e aponte erros, faltas de batida, jornadas que viram o dia, horas extras e adicional noturno.
Escala informada: ${escala ?? "não identificada"}
Colaborador: ${colaborador || "não informado"}
Período: ${periodo || "não informado"}
Total calculado: ${minutosParaTexto(resumo.minutosTotais)}
Horas extras calculadas: ${minutosParaTexto(horasExtras.total)} (jornada normal ${minutosParaTexto(jornadaPadrao)})
Resumo semanal: ${resumo.semanas.map((s) => `${s.rotulo} = ${minutosParaTexto(s.minutos)}`).join(" | ")}
Resumo mensal: ${resumo.meses.map((m) => `${m.rotulo} = ${minutosParaTexto(m.minutos)}`).join(" | ")}

Dias:
${linhas}

Responda em português, curto e objetivo, em tópicos.`;

      const resposta = await manusExecutarTarefa({
        data: {
          apiKey: config.apiKey,
          prompt,
          agentProfile: config.agentProfile,
          locale: config.locale,
          hideInTaskList: config.hideInTaskList,
        },
      });
      setParecerManus(resposta.content);
      toast.success("Conferência da Manus AI concluída.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "A Manus AI não respondeu.");
    } finally {
      setManusCarregando(false);
    }
  }

  async function lerPdf(file: File) {
    setLendo(true);
    limparIA();
    try {
      const paginas = await textoDePdf(file);
      preencherIdentificacao(limparRodape(paginas.join("\n")));
      const conteudo = limparCabecalho(limparRodape(paginas.join("\n")), { manterEscala: true });
      setTexto(conteudo);
      calcularLocal(conteudo);
      await analisarComIA(conteudo);
    } catch {
      toast.error("Não foi possível ler os horários deste arquivo.");
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 uppercase">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Calculator className="h-5 w-5" />
          </span>
          Calculadora de folha
        </CardTitle>
        <CardDescription>
          Importe a folha de ponto em PDF: o sistema lê a folha inteira, localiza a escala e os
          horários com a IA (Gemini) e monta o resumo do dia, da semana, do mês e das horas
          extras. A Manus AI pode conferir o cálculo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void lerPdf(file);
            }}
          />
          <Button
            variant="outline"
            disabled={lendo || analisandoIA}
            onClick={() => inputRef.current?.click()}
          >
            {lendo ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Importar PDF
          </Button>
          <Button onClick={() => calcularLocal()} disabled={!texto.trim() || lendo || analisandoIA}>
            <Calculator className="mr-2 h-4 w-4" />
            Calcular horários
          </Button>
          <Button
            variant="secondary"
            disabled={!texto.trim() || lendo || analisandoIA}
            onClick={() => void analisarComIA()}
          >
            {analisandoIA ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Analisar com Gemini
          </Button>
          {dias.length > 0 && (
            <Button
              variant="secondary"
              disabled={manusCarregando}
              onClick={() => void conferirComManus()}
            >
              {manusCarregando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BrainCircuit className="mr-2 h-4 w-4" />
              )}
              Conferir com Manus AI
            </Button>
          )}
          {dias.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setDias([]);
                setTexto("");
                limparIA();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>

        {analisandoIA && (
          <p className="text-xs text-muted-foreground">
            Lendo a folha completa com a IA e conferindo a escala…
          </p>
        )}

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder={
            "Cole aqui os horários, um dia por linha. Ex.:\n01/09 08:00 12:00 13:00 17:00"
          }
        />

        {dias.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={fonte === "ia" ? "default" : "secondary"}>
                {fonte === "ia"
                  ? `Leitura por IA${modeloIA ? ` · ${modeloIA}` : ""}`
                  : "Leitura local"}
              </Badge>
              {colaborador && (
                <Badge variant="outline" className="flex items-center gap-1 font-semibold">
                  <User className="h-3 w-3" /> Colaborador: {colaborador}
                </Badge>
              )}
              {importador && (
                <Badge variant="outline" className="flex items-center gap-1 font-semibold">
                  <User className="h-3 w-3" /> Importado por: {importador}
                </Badge>
              )}
              {escala && <Badge variant="outline">Escala: {escala}</Badge>}
              {periodo && <Badge variant="outline">Período: {periodo}</Badge>}
            </div>

            {/* Horas extras em destaque */}
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold uppercase">
                  <Timer className="h-4 w-4 text-primary" /> Horas extras
                </p>
                <Badge variant="outline">
                  Jornada normal: {minutosParaTexto(jornadaPadrao)} por dia
                </Badge>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Total de horas extras
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                    {minutosParaTexto(horasExtras.total)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Dias com horas extras
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {horasExtras.porDia.length}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Maior extra em um dia
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {minutosParaTexto(
                      horasExtras.porDia.reduce((m, e) => Math.max(m, e.extras), 0),
                    )}
                  </p>
                </div>
              </div>

              {horasExtras.porDia.length > 0 ? (
                <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dia</TableHead>
                        <TableHead>Total do dia</TableHead>
                        <TableHead>Horas extras</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {horasExtras.porDia.map((e, i) => (
                        <TableRow key={`extra-${e.dia}-${i}`}>
                          <TableCell className="font-medium">{e.dia}</TableCell>
                          <TableCell className="tabular-nums">
                            {minutosParaTexto(e.minutos)}
                          </TableCell>
                          <TableCell className="tabular-nums font-semibold text-primary">
                            +{minutosParaTexto(e.extras)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum dia ficou acima da jornada normal — sem horas extras no período.
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> Cálculo do dia
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {minutosParaTexto(resumo.mediaPorDia)}
                </p>
                <p className="text-xs text-muted-foreground">
                  média por dia · {diasComMarcacao} dia(s) com marcação
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  <CalendarRange className="h-4 w-4" /> Cálculo da semana
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {minutosParaTexto(
                    resumo.semanas.length
                      ? resumo.minutosTotais / resumo.semanas.length
                      : resumo.minutosTotais,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  média semanal · {resumo.semanas.length} semana(s)
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  <Calculator className="h-4 w-4" /> Cálculo mensal
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {minutosParaTexto(resumo.minutosTotais)}
                </p>
                <p className="text-xs text-muted-foreground">total do período importado</p>
              </div>
            </div>

            {resumo.semanas.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Semana</TableHead>
                      <TableHead>Dias</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumo.semanas.map((s) => (
                      <TableRow key={s.rotulo}>
                        <TableCell className="font-medium">{s.rotulo}</TableCell>
                        <TableCell className="tabular-nums">{s.quantidadeDias}</TableCell>
                        <TableCell className="tabular-nums">
                          {minutosParaTexto(s.minutos)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {resumo.meses.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead>Dias</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumo.meses.map((m) => (
                      <TableRow key={m.rotulo}>
                        <TableCell className="font-medium capitalize">{m.rotulo}</TableCell>
                        <TableCell className="tabular-nums">{m.quantidadeDias}</TableCell>
                        <TableCell className="tabular-nums">
                          {minutosParaTexto(m.minutos)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Marcações</TableHead>
                    <TableHead>Total do dia</TableHead>
                    <TableHead>Horas extras</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumo.dias.map((d, i) => {
                    const extra = extrasPorDia.get(d.dia) ?? 0;
                    return (
                      <TableRow key={`${d.dia}-${i}`}>
                        <TableCell className="font-medium">{d.dia}</TableCell>
                        <TableCell className="tabular-nums">
                          {d.horarios.join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {minutosParaTexto(d.minutos)}
                        </TableCell>
                        <TableCell
                          className={`tabular-nums ${extra > 0 ? "font-semibold text-primary" : "text-muted-foreground"}`}
                        >
                          {extra > 0 ? `+${minutosParaTexto(extra)}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.observacao ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {avisosIA.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Observações da IA
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {avisosIA.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {parecerManus && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Conferência da Manus AI
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{parecerManus}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
