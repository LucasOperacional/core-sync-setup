import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Download, Loader2, MapPin } from "lucide-react";
import { gerarComprovanteAssinaturaMovimentacao } from "@/lib/movimentacao-assinatura-comprovante";
import { Checkbox } from "@/components/ui/checkbox";
import { PadAssinatura } from "@/components/assinatura/PadAssinatura";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/assinar-movimentacao/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Assinar movimentação de posto" },
      {
        name: "description",
        content:
          "Confira os dados da sua movimentação de posto e assine digitalmente pelo celular.",
      },
      { property: "og:title", content: "Assinar movimentação de posto" },
      {
        property: "og:description",
        content:
          "Confira os dados da sua movimentação de posto e assine digitalmente pelo celular.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssinarMovimentacaoPage,
});

interface Movimentacao {
  protocolo: string;
  status: "pendente" | "aprovada" | "recusada";
  colaborador: string;
  cargo: string | null;
  postoAtual: string;
  novoPosto: string;
  dataMovimentacao: string;
  motivo: string;
  supervisor: string | null;
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

function AssinarMovimentacaoPage() {
  const { token } = Route.useParams();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Movimentacao | null>(null);
  const [nome, setNome] = useState("");
  const [assinatura, setAssinatura] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [declaracao, setDeclaracao] = useState(false);
  const [local, setLocal] = useState<{
    latitude: number;
    longitude: number;
    precisaoMetros: number | null;
  } | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "pendente" | "capturando" | "capturada" | "negada" | "indisponivel"
  >("pendente");
  const [comprovante, setComprovante] = useState<{
    assinadoEm: string;
    ip: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null>(null);

  const capturarLocal = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("indisponivel");
      return;
    }
    setGeoStatus("capturando");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLocal({
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
          precisaoMetros: Number.isFinite(posicao.coords.accuracy) ? posicao.coords.accuracy : null,
        });
        setGeoStatus("capturada");
      },
      (falha) => setGeoStatus(falha.code === falha.PERMISSION_DENIED ? "negada" : "indisponivel"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    capturarLocal();
  }, [capturarLocal]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/public/movimentacao/assinatura?t=${encodeURIComponent(token)}`,
      );
      const corpo = (await resposta.json()) as Movimentacao & { erro?: string };
      if (!resposta.ok) throw new Error(corpo.erro || "Não foi possível abrir este link.");
      setDados(corpo);
      setNome(corpo.colaborador);
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
    if (!declaracao) {
      setErro("Marque a declaração de concordância antes de assinar.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/public/movimentacao/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          nome: nome.trim(),
          assinatura,
          declaracao: true,
          latitude: local?.latitude ?? null,
          longitude: local?.longitude ?? null,
          precisaoMetros: local?.precisaoMetros ?? null,
          geoStatus,
        }),
      });
      const corpo = (await resposta.json()) as {
        ok?: boolean;
        erro?: string;
        comprovante?: {
          assinadoEm: string;
          ip: string | null;
          latitude: number | null;
          longitude: number | null;
        };
      };
      if (!resposta.ok || !corpo.ok)
        throw new Error(corpo.erro || "Não foi possível registrar a assinatura.");
      setComprovante(corpo.comprovante ?? null);
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
            <ArrowRightLeft />
          </span>
          <h1 className="mt-3 text-2xl font-bold text-foreground">
            ASSINATURA DA MOVIMENTAÇÃO DE POSTO
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Confira os dados abaixo e assine para dar ciência da sua transferência de posto.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando a movimentação...
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
                <CardTitle>Protocolo {dados.protocolo}</CardTitle>
                <CardDescription>
                  Solicitado por {dados.supervisor || "supervisor"} em{" "}
                  {formatar(dados.solicitadoEm)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Colaborador:</span>{" "}
                  <strong>{dados.colaborador}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Cargo:</span>{" "}
                  <strong>{dados.cargo || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Posto atual:</span>{" "}
                  <strong>{dados.postoAtual}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Novo posto:</span>{" "}
                  <strong>{dados.novoPosto}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Data da movimentação:</span>{" "}
                  <strong>{formatar(dados.dataMovimentacao)}</strong>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Motivo:</span>{" "}
                  <strong>{dados.motivo}</strong>
                </div>
              </CardContent>
            </Card>

            {concluido || dados.assinado ? (
              <>
                <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-4 text-sm text-success">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Assinatura registrada com sucesso. A movimentação segue para autorização da
                    Coordenação. Você já pode fechar esta página.
                  </span>
                </div>
                {comprovante ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Comprovante da assinatura</CardTitle>
                      <CardDescription>
                        Estes dados ficam guardados junto ao protocolo {dados.protocolo}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">Data e hora:</span>{" "}
                        <strong>{formatar(comprovante.assinadoEm)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Endereço de acesso (IP):</span>{" "}
                        <strong>{comprovante.ip || "não identificado"}</strong>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Localização:</span>{" "}
                        <strong>
                          {comprovante.latitude !== null && comprovante.longitude !== null
                            ? `${comprovante.latitude.toFixed(6)}, ${comprovante.longitude.toFixed(6)}`
                            : "não autorizada pelo aparelho"}
                        </strong>
                      </div>
                      <div className="sm:col-span-2 flex justify-end pt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            const doc = gerarComprovanteAssinaturaMovimentacao(
                              {
                                protocolo: dados.protocolo,
                                colaborador: dados.colaborador,
                                cargo: dados.cargo,
                                postoAtual: dados.postoAtual,
                                novoPosto: dados.novoPosto,
                                dataMovimentacao: dados.dataMovimentacao,
                                motivo: dados.motivo,
                                supervisor: dados.supervisor,
                                solicitadoEm: dados.solicitadoEm,
                              },
                              {
                                nome: nome.trim() || dados.colaborador,
                                assinadoEm: comprovante.assinadoEm,
                                ip: comprovante.ip,
                                latitude: comprovante.latitude,
                                longitude: comprovante.longitude,
                              },
                            );
                            doc.save(`Comprovante_Assinatura_${dados.protocolo}.pdf`);
                          }}
                        >
                          <Download /> Baixar comprovante (PDF)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </>
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
                      rotulo={`Assinatura de ${dados.colaborador}`}
                      altura={180}
                      onChange={(dataUrl) => setAssinatura(dataUrl ?? "")}
                    />
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <MapPin className="size-4" /> Localização do momento da assinatura
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {geoStatus === "capturada" && local
                        ? `Localização confirmada (${local.latitude.toFixed(5)}, ${local.longitude.toFixed(5)}${local.precisaoMetros ? ` · precisão de ${Math.round(local.precisaoMetros)} m` : ""}).`
                        : geoStatus === "capturando"
                          ? "Obtendo a localização do aparelho..."
                          : geoStatus === "negada"
                            ? "Você negou o acesso à localização. Libere no navegador para registrar onde a assinatura foi feita."
                            : geoStatus === "indisponivel"
                              ? "Não foi possível obter a localização deste aparelho. A assinatura continua válida."
                              : "Aguardando permissão de localização."}
                    </p>
                    {geoStatus !== "capturada" && geoStatus !== "capturando" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={capturarLocal}
                      >
                        Tentar novamente
                      </Button>
                    ) : null}
                  </div>

                  <label className="flex items-start gap-3 rounded-md border border-border p-3 text-xs text-muted-foreground">
                    <Checkbox
                      checked={declaracao}
                      onCheckedChange={(marcado) => setDeclaracao(marcado === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Declaro que li e estou ciente desta movimentação de posto e concordo em
                      assiná-la eletronicamente. Estou ciente de que serão registrados data, hora,
                      endereço de acesso (IP), aparelho e localização para fins de auditoria (MP
                      2.200-2/2001, art. 10, §2º).
                    </span>
                  </label>
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
