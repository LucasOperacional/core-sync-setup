import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FloatingNav } from "@/components/FloatingNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AREAS_GERENTES, nomeAmigavel } from "@/lib/areas-gerentes";
import {
  listarAvaliacoesGerentes,
  salvarAvaliacaoGerente,
  removerAvaliacaoGerente,
} from "@/lib/avaliacao-gerentes.functions";

export const Route = createFileRoute("/_authenticated/avaliacao-gerentes")({
  head: () => ({
    meta: [
      { title: "Ficha de Avaliação dos Gerentes de Área | CIOP" },
      {
        name: "description",
        content:
          "Preencha a ficha de avaliação mensal dos gerentes de área com notas por critério e observações.",
      },
      { property: "og:title", content: "Ficha de Avaliação dos Gerentes de Área | CIOP" },
      {
        property: "og:description",
        content: "Avalie liderança, operação, comunicação, prazos e relacionamento com o cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AvaliacaoGerentesPage,
});

const CRITERIOS = [
  { chave: "notaLideranca", label: "Liderança da equipe" },
  { chave: "notaOperacao", label: "Operação dos postos" },
  { chave: "notaComunicacao", label: "Comunicação" },
  { chave: "notaPrazos", label: "Cumprimento de prazos" },
  { chave: "notaCliente", label: "Relacionamento com o cliente" },
] as const;

type ChaveCriterio = (typeof CRITERIOS)[number]["chave"];

const mesAtual = () => new Date().toISOString().slice(0, 7);

function AvaliacaoGerentesPage() {
  const listar = useServerFn(listarAvaliacoesGerentes);
  const salvar = useServerFn(salvarAvaliacaoGerente);
  const remover = useServerFn(removerAvaliacaoGerente);
  const queryClient = useQueryClient();

  const [gerente, setGerente] = useState("");
  const [mes, setMes] = useState(mesAtual());
  const [avaliador, setAvaliador] = useState("");
  const [notas, setNotas] = useState<Record<ChaveCriterio, number>>({
    notaLideranca: 3,
    notaOperacao: 3,
    notaComunicacao: 3,
    notaPrazos: 3,
    notaCliente: 3,
  });
  const [pontosFortes, setPontosFortes] = useState("");
  const [pontosMelhoria, setPontosMelhoria] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  /** Momento em que o preenchimento da ficha começou (para medir o tempo de execução). */
  const inicioPreenchimento = useRef(Date.now());

  const fichas = useQuery({
    queryKey: ["avaliacoes-gerentes"],
    queryFn: () => listar(),
  });

  const limpar = () => {
    setGerente("");
    setMes(mesAtual());
    setAvaliador("");
    setNotas({
      notaLideranca: 3,
      notaOperacao: 3,
      notaComunicacao: 3,
      notaPrazos: 3,
      notaCliente: 3,
    });
    setPontosFortes("");
    setPontosMelhoria("");
    setObservacoes("");
    inicioPreenchimento.current = Date.now();
  };

  const enviar = async () => {
    if (!gerente) {
      toast.error("Escolha o gerente de área.");
      return;
    }
    setSalvando(true);
    try {
      const r = await salvar({
        data: {
          gerenteNome: gerente,
          mesReferencia: mes,
          ...notas,
          pontosFortes,
          pontosMelhoria,
          observacoes,
          avaliadorNome: avaliador,
          duracaoSegundos: Math.max(
            0,
            Math.round((Date.now() - inicioPreenchimento.current) / 1000),
          ),
        },
      });
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível salvar a ficha.");
        return;
      }
      toast.success("Ficha de avaliação salva.");
      limpar();
      void queryClient.invalidateQueries({ queryKey: ["avaliacoes-gerentes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a ficha.");
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (id: string) => {
    const r = await remover({ data: { id } });
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível apagar a ficha.");
      return;
    }
    toast.success("Ficha removida.");
    void queryClient.invalidateQueries({ queryKey: ["avaliacoes-gerentes"] });
  };

  const lista = fichas.data?.ok ? fichas.data.avaliacoes : [];

  return (
    <main className="min-h-screen pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <Link
            to="/coordenacao"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Coordenação
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-2xl font-bold sm:text-3xl">
            <ClipboardCheck className="size-7 text-primary" />
            Ficha de Avaliação dos Gerentes de Área
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dê uma nota de 1 a 5 para cada critério e registre os comentários do mês.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova ficha</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Gerente de área</Label>
                <Select value={gerente} onValueChange={setGerente}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS_GERENTES.map((nome) => (
                      <SelectItem key={nome} value={nome}>
                        {nomeAmigavel(nome)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mes">Mês de referência</Label>
                <Input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="avaliador">Avaliador</Label>
                <Input
                  id="avaliador"
                  value={avaliador}
                  onChange={(e) => setAvaliador(e.target.value)}
                  placeholder="Quem está avaliando"
                />
              </div>
            </div>

            <div className="grid gap-3">
              {CRITERIOS.map((c) => (
                <div
                  key={c.chave}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="text-sm font-medium">{c.label}</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${c.label}: nota ${n}`}
                        onClick={() => setNotas((atual) => ({ ...atual, [c.chave]: n }))}
                        className="rounded-md p-1 transition-colors hover:bg-muted"
                      >
                        <Star
                          className={
                            n <= notas[c.chave]
                              ? "size-5 fill-primary text-primary"
                              : "size-5 text-muted-foreground"
                          }
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="fortes">Pontos fortes</Label>
                <Textarea
                  id="fortes"
                  value={pontosFortes}
                  onChange={(e) => setPontosFortes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="melhoria">Pontos de melhoria</Label>
                <Textarea
                  id="melhoria"
                  value={pontosMelhoria}
                  onChange={(e) => setPontosMelhoria(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="obs">Observações gerais</Label>
              <Textarea
                id="obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={enviar} disabled={salvando}>
                {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvar ficha
              </Button>
              <Button variant="outline" onClick={limpar} disabled={salvando}>
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fichas preenchidas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {fichas.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando fichas...</p>
            )}
            {!fichas.isLoading && lista.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma ficha preenchida ainda.</p>
            )}
            {lista.map((f) => {
              const media =
                (f.nota_lideranca +
                  f.nota_operacao +
                  f.nota_comunicacao +
                  f.nota_prazos +
                  f.nota_cliente) /
                5;
              return (
                <div key={f.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{nomeAmigavel(f.gerente_nome)}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.mes_referencia}
                        {f.avaliador_nome ? ` · por ${f.avaliador_nome}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Média {media.toFixed(1)}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Apagar ficha"
                        onClick={() => void apagar(f.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {f.observacoes && (
                    <p className="mt-2 text-xs text-muted-foreground">{f.observacoes}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <FloatingNav />
    </main>
  );
}
