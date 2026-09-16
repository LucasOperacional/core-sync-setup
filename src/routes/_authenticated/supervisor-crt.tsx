import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Link as LinkIcon, Loader2, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { FloatingNav } from "@/components/FloatingNav";
import { DadosSubstituidoCard } from "@/components/DadosSubstituidoCard";
import { DadosReservaSubstitutoCard, type SimNao } from "@/components/DadosReservaSubstitutoCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { enviarCrtParaCoordenacao } from "@/lib/crt-lancamentos.functions";
import type { NomeColaboradorNexti, PostoNexti } from "@/lib/nexti-ativos.functions";

export const Route = createFileRoute("/_authenticated/supervisor-crt")({
  head: () => ({
    meta: [{ title: "Lançamento de CRT | Supervisor" }],
  }),
  component: SupervisorCrtPage,
});

function SupervisorCrtPage() {
  const [substituido, setSubstituido] = useState<NomeColaboradorNexti | null>(null);
  const [dataHora, setDataHora] = useState("");
  const [dataHoraFim, setDataHoraFim] = useState("");
  const [postoSelecionado, setPostoSelecionado] = useState<PostoNexti | null>(null);
  const [motivo, setMotivo] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [substituto, setSubstituto] = useState<NomeColaboradorNexti | null>(null);
  const [recebeuVt, setRecebeuVt] = useState<SimNao>("");
  const [recebeuRefeicao, setRecebeuRefeicao] = useState<SimNao>("");
  const [valorReceber, setValorReceber] = useState("");
  const [recebidoEm, setRecebidoEm] = useState("");
  const [linkAssinatura, setLinkAssinatura] = useState<{ url: string; colaborador: string } | null>(
    null,
  );
  const [enviando, setEnviando] = useState(false);
  const enviar = useServerFn(enviarCrtParaCoordenacao);

  const podeEnviar = Boolean(substituido && dataHora && !enviando);

  async function enviarParaCoordenacao() {
    if (!substituido) return;
    setEnviando(true);
    try {
      const r = await enviar({
        data: {
          colaborador: substituido.colaborador,
          personId: String(substituido.personId ?? ""),
          postoNome: postoSelecionado?.nome ?? "",
          postoId: String(postoSelecionado?.id ?? ""),
          motivo,
          inicio: dataHora,
          fim: dataHoraFim,
          supervisor,
          substituto: substituto?.colaborador ?? "",
          substitutoPersonId: String(substituto?.personId ?? ""),
          recebeuVt,
          recebeuRefeicao,
          valorReceber,
          recebidoEm,
          origemUrl: window.location.origin,
        },
      });
      if (!r?.ok) {
        toast.error(r.erro ?? "Não foi possível enviar para a coordenação.");
        return;
      }
      toast.success("CRT enviado. Envie o link de assinatura ao colaborador.");
      setLinkAssinatura({
        url: r.linkAssinatura,
        colaborador: substituto?.colaborador || substituido.colaborador,
      });
      setSubstituido(null);
      setDataHora("");
      setDataHoraFim("");
      setPostoSelecionado(null);
      setMotivo("");
      setSubstituto(null);
      setRecebeuVt("");
      setRecebeuRefeicao("");
      setValorReceber("");
      setRecebidoEm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap flex-col gap-6 px-6 py-10">
          <Link
            to="/supervisor"
            className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar à Supervisão
          </Link>
          <div>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl text-foreground">
              Lançamento de CRT
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Controle e registro de Certificados de Regularidade Trabalhista.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 py-8">
        {linkAssinatura ? (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="size-5 text-primary" /> Link de assinatura gerado
              </CardTitle>
              <CardDescription>
                Envie o link para {linkAssinatura.colaborador} assinar o CRT.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="break-all rounded-md border border-border bg-background px-3 py-2 text-xs">
                {linkAssinatura.url}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(linkAssinatura.url)
                      .then(() => toast.success("Link copiado."))
                      .catch(() => toast.error("Não foi possível copiar o link."));
                  }}
                >
                  <Copy className="size-4" /> Copiar link
                </Button>
                <Button type="button" variant="secondary" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Olá, ${linkAssinatura.colaborador}. Assine o seu CRT neste link: ${linkAssinatura.url}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" /> Enviar pelo WhatsApp
                  </a>
                </Button>
                <Button type="button" variant="ghost" onClick={() => setLinkAssinatura(null)}>
                  <X className="size-4" /> Fechar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <DadosSubstituidoCard
          selecionado={substituido}
          onSelecionar={setSubstituido}
          dataHora={dataHora}
          onDataHoraChange={setDataHora}
          dataHoraFim={dataHoraFim}
          onDataHoraFimChange={setDataHoraFim}
          postoSelecionado={postoSelecionado}
          onPostoSelecionadoChange={setPostoSelecionado}
          motivo={motivo}
          onMotivoChange={setMotivo}
          supervisor={supervisor}
          onSupervisorChange={setSupervisor}
        />

        <DadosReservaSubstitutoCard
          substituto={substituto}
          onSubstitutoChange={setSubstituto}
          recebeuVt={recebeuVt}
          onRecebeuVtChange={setRecebeuVt}
          recebeuRefeicao={recebeuRefeicao}
          onRecebeuRefeicaoChange={setRecebeuRefeicao}
          valorReceber={valorReceber}
          onValorReceberChange={setValorReceber}
          recebidoEm={recebidoEm}
          onRecebidoEmChange={setRecebidoEm}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="size-5 text-primary" /> Assinatura digital do colaborador
            </CardTitle>
            <CardDescription>
              Ao enviar, o sistema gera um link único de assinatura do CRT — sem precisar anexar
              documento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Procedimento
            </Label>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Envie o CRT para a Coordenação: o link de assinatura aparece aqui.</li>
              <li>Copie o link ou envie pelo WhatsApp ao colaborador.</li>
              <li>Ele abre no celular, confere os dados do CRT e confirma o nome completo.</li>
              <li>Assina com o dedo na tela e toca em confirmar assinatura.</li>
              <li>A assinatura fica registrada com data, hora e endereço de acesso.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              O link vale por 7 dias e só pode ser usado uma vez.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={() => void enviarParaCoordenacao()} disabled={!podeEnviar}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar para lançamento (Coordenação)
          </Button>
        </div>
      </div>
      <FloatingNav />
    </main>
  );
}
