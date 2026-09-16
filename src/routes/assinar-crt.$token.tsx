import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, FileSignature, Loader2 } from "lucide-react";
import { PadAssinatura } from "@/components/assinatura/PadAssinatura";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/assinar-crt/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Assinar CRT" },
      {
        name: "description",
        content: "Confira os dados do seu CRT e assine digitalmente pelo celular.",
      },
      { property: "og:title", content: "Assinar CRT" },
      {
        property: "og:description",
        content: "Confira os dados do seu CRT e assine digitalmente pelo celular.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssinarCrtPage,
});

interface Crt {
  colaborador: string;
  postoNome: string;
  motivo: string;
  inicio: string | null;
  fim: string | null;
  supervisor: string | null;
  substituto: string;
  recebeuVt: string;
  recebeuRefeicao: string;
  valorReceber: string;
  recebidoEm: string | null;
  solicitadoEm: string;
  assinado: boolean;
  assinadoEm: string | null;
}

function formatar(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
  return Number.isNaN(data.getTime())
    ? valor
    : valor.length === 10
      ? data.toLocaleDateString("pt-BR")
      : data.toLocaleString("pt-BR");
}

function AssinarCrtPage() {
  const { token } = Route.useParams();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Crt | null>(null);
  const [nome, setNome] = useState("");
  const [assinatura, setAssinatura] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/public/crt/assinatura?t=${encodeURIComponent(token)}`);
      const corpo = (await resposta.json()) as Crt & { erro?: string };
      if (!resposta.ok) throw new Error(corpo.erro || "Não foi possível abrir este link.");
      setDados(corpo);
      setNome(corpo.substituto || corpo.colaborador);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível abrir este link.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function confirmar() {
    if (nome.trim().length < 3) {
      setErro("Digite seu nome completo para confirmar.");
      return;
    }
    if (!assinatura) {
      setErro("Desenhe sua assinatura no quadro.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/public/crt/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, nome: nome.trim(), assinatura }),
      });
      const corpo = (await resposta.json()) as { ok?: boolean; erro?: string };
      if (!resposta.ok || !corpo.ok)
        throw new Error(corpo.erro || "Não foi possível registrar a assinatura.");
      setConcluido(true);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível registrar a assinatura.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/20 pb-16">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileSignature />
          </span>
          <h1 className="mt-3 text-2xl font-bold text-foreground">ASSINATURA DO CRT</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Confira os dados abaixo e assine para validar o documento do CRT.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando o CRT...
          </div>
        ) : null}

        {!carregando && erro && !dados ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{erro}</span>
          </div>
        ) : null}

        {dados ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Dados do CRT</CardTitle>
                <CardDescription>
                  Enviado por {dados.supervisor || "supervisor"} em {formatar(dados.solicitadoEm)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Colaborador substituído:</span>{" "}
                  <strong>{dados.colaborador}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Substituto:</span>{" "}
                  <strong>{dados.substituto || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Posto:</span>{" "}
                  <strong>{dados.postoNome || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Motivo:</span>{" "}
                  <strong>{dados.motivo || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Início:</span>{" "}
                  <strong>{formatar(dados.inicio)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Fim:</span>{" "}
                  <strong>{formatar(dados.fim)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Recebeu vale-transporte:</span>{" "}
                  <strong>{dados.recebeuVt || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Recebeu refeição:</span>{" "}
                  <strong>{dados.recebeuRefeicao || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor a receber:</span>{" "}
                  <strong>{dados.valorReceber || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Recebido em:</span>{" "}
                  <strong>{formatar(dados.recebidoEm)}</strong>
                </div>
              </CardContent>
            </Card>

            {concluido || dados.assinado ? (
              <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-4 text-sm text-success">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>
                  Assinatura registrada com sucesso. O CRT segue para lançamento na Coordenação.
                  Você já pode fechar esta página.
                </span>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Como assinar</CardTitle>
                  <CardDescription>
                    1. Confira os dados acima. 2. Confirme seu nome completo. 3. Desenhe sua
                    assinatura com o dedo ou o mouse. 4. Toque em confirmar assinatura.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome-assinante">Nome completo</Label>
                    <Input
                      id="nome-assinante"
                      value={nome}
                      onChange={(evento) => setNome(evento.target.value)}
                      placeholder="Digite seu nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Assinatura</Label>
                    <PadAssinatura
                      rotulo={`Assinatura de ${dados.substituto || dados.colaborador}`}
                      altura={180}
                      onChange={(dataUrl) => setAssinatura(dataUrl ?? "")}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao confirmar, você declara estar ciente do CRT e sua assinatura é registrada com
                    data, hora e endereço de acesso.
                  </p>
                  {erro ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{erro}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-end">
                    <Button onClick={() => void confirmar()} disabled={enviando}>
                      {enviando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmar
                      assinatura
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
