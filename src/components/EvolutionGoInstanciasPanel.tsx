import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronDown, Loader2, Plus, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  evolutionGoCriarInstancias,
  evolutionGoListarInstancias,
  evolutionGoSelecionarInstancia,
  type InstanciaEvolution,
} from "@/lib/evolution-go.functions";

/** Endereço público do recebedor de mensagens deste projeto. */
function enderecoRecebedor(): string {
  const host = window.location.hostname;
  const projeto = host.endsWith(".lovableproject.com") ? host.split(".")[0] : "";
  const base = projeto ? `https://project--${projeto}-dev.lovable.app` : window.location.origin;
  return `${base}/api/public/evolution-webhook`;
}

/**
 * Painel do Chat Interno para criar e trocar de números do WhatsApp.
 * Ao criar, o sistema busca o identificador da nova conexão, usa a chave
 * global já salva e deixa tudo configurado (recebimento de mensagens incluso).
 */
export function EvolutionGoInstanciasPanel() {
  const listar = useServerFn(evolutionGoListarInstancias);
  const criar = useServerFn(evolutionGoCriarInstancias);
  const selecionar = useServerFn(evolutionGoSelecionarInstancia);

  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [instancias, setInstancias] = useState<InstanciaEvolution[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [prefixo, setPrefixo] = useState("whatsapp");
  const [quantidade, setQuantidade] = useState("1");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listar({});
      setInstancias(r.instancias);
      setErro(r.ok ? null : (r.erro ?? "Não foi possível listar."));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    if (aberto) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const criarVarias = async () => {
    setCriando(true);
    try {
      const r = await criar({
        data: {
          prefixo: prefixo.trim(),
          quantidade: Number(quantidade) || 1,
          webhookUrl: enderecoRecebedor(),
        },
      });
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível criar.");
        return;
      }
      const falhas = r.criadas.filter((c) => c.erro);
      toast.success(
        `${r.criadas.length - falhas.length} conexão(ões) criada(s) e configurada(s).`,
      );
      for (const f of falhas) toast.error(`${f.nome}: ${f.erro}`);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCriando(false);
    }
  };

  const usar = async (nome: string) => {
    const r = await selecionar({ data: { nome } });
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível trocar.");
      return;
    }
    toast.success(`Agora usando "${nome}".`);
    await carregar();
  };

  return (
    <div className="border-b border-border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        <Smartphone className="size-4 text-emerald-400" />
        Números do WhatsApp
        <ChevronDown
          className={`ml-auto size-4 transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </button>

      {aberto ? (
        <div className="space-y-3 border-t border-border p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="evo-prefixo">Nome base</Label>
              <Input
                id="evo-prefixo"
                value={prefixo}
                onChange={(e) => setPrefixo(e.target.value)}
                className="w-48"
                placeholder="whatsapp"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evo-qtd">Quantidade</Label>
              <Input
                id="evo-qtd"
                type="number"
                min={1}
                max={20}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-24"
              />
            </div>
            <Button onClick={criarVarias} disabled={criando}>
              {criando ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Criar e configurar
            </Button>
            <Button variant="outline" onClick={carregar} disabled={carregando}>
              {carregando ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Atualizar
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            As novas conexões já usam a chave global salva e ficam prontas para receber mensagens
            no Chat Interno. Depois, leia o QR Code na tela de administração.
          </p>

          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}

          <div className="space-y-2">
            {instancias.map((i) => (
              <div
                key={i.nome}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
              >
                <span className="text-sm font-medium">{i.nome}</span>
                {i.conectada ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500">Conectado</Badge>
                ) : (
                  <Badge variant="secondary">Aguardando QR Code</Badge>
                )}
                {i.ativa ? (
                  <Badge variant="outline">
                    <CheckCircle2 className="mr-1 size-3" /> Em uso
                  </Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => usar(i.nome)}>
                    Usar este
                  </Button>
                )}
              </div>
            ))}
            {!carregando && instancias.length === 0 && !erro ? (
              <p className="text-sm text-muted-foreground">Nenhuma conexão criada ainda.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
