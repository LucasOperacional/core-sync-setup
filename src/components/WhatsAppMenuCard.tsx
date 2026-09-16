import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  whatsappMenuObter,
  whatsappMenuSalvar,
  whatsappMenuEnviarTeste,
  MAX_BOTOES,
  type MenuBotao,
} from "@/lib/whatsapp-menu.functions";

type Fila = { id: string; nome: string; ativa: boolean };

export function WhatsAppMenuCard() {
  const obter = useServerFn(whatsappMenuObter);
  const salvar = useServerFn(whatsappMenuSalvar);
  const enviarTeste = useServerFn(whatsappMenuEnviarTeste);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [ativo, setAtivo] = useState(false);
  const [titulo, setTitulo] = useState("Atendimento");
  const [descricao, setDescricao] = useState("");
  const [rodape, setRodape] = useState("");
  const [botoes, setBotoes] = useState<MenuBotao[]>([]);
  const [numeroTeste, setNumeroTeste] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await obter({});
      if (!r.ok) {
        toast.error(r.erro || "Não foi possível carregar o menu.");
        return;
      }
      setFilas(r.filas);
      setAtivo(r.menu.ativo);
      setTitulo(r.menu.titulo);
      setDescricao(r.menu.descricao);
      setRodape(r.menu.rodape);
      setBotoes(r.menu.botoes);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar o menu.");
    } finally {
      setCarregando(false);
    }
  }, [obter]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alterarBotao(i: number, campo: keyof MenuBotao, valor: string) {
    setBotoes((atual) =>
      atual.map((b, idx) => (idx === i ? { ...b, [campo]: valor } : b)),
    );
  }

  async function gravar() {
    setSalvando(true);
    try {
      const r = await salvar({
        data: { ativo, titulo, descricao, rodape, botoes },
      });
      if (!r.ok) toast.error(r.erro || "Não foi possível salvar.");
      else {
        toast.success("Menu salvo.");
        await carregar();
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar o menu.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setEnviando(true);
    try {
      const r = await enviarTeste({ data: { numero: numeroTeste } });
      if (!r.ok) toast.error(r.erro || "Não foi possível enviar o menu.");
      else toast.success("Menu enviado.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar o menu.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Menu de botões</h3>
          <p className="text-xs text-muted-foreground">
            Quando alguém fala com o WhatsApp pela primeira vez, recebe este menu. Ao tocar em um
            botão, a conversa vai direto para a fila escolhida.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="wa-menu-ativo" className="text-xs">
            Ativo
          </Label>
          <Switch id="wa-menu-ativo" checked={ativo} onCheckedChange={setAtivo} />
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wa-menu-titulo">Título</Label>
              <Input
                id="wa-menu-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-menu-rodape">Rodapé</Label>
              <Input
                id="wa-menu-rodape"
                value={rodape}
                onChange={(e) => setRodape(e.target.value)}
                maxLength={60}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-menu-desc">Mensagem</Label>
            <Textarea
              id="wa-menu-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Botões (até {MAX_BOTOES})</Label>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={botoes.length >= MAX_BOTOES}
                onClick={() => setBotoes((a) => [...a, { texto: "", queueId: "" }])}
              >
                <Plus className="mr-1 size-3.5" />
                Adicionar botão
              </Button>
            </div>
            {botoes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                Nenhum botão. Adicione um e escolha a fila de destino.
              </p>
            ) : (
              botoes.map((b, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2"
                >
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-[10px]">Texto do botão</Label>
                    <Input
                      value={b.texto}
                      maxLength={24}
                      placeholder="Ex.: Suporte"
                      onChange={(e) => alterarBotao(i, "texto", e.target.value)}
                    />
                  </div>
                  <div className="min-w-44 flex-1 space-y-1">
                    <Label className="text-[10px]">Fila de atendimento</Label>
                    <Select
                      value={b.queueId}
                      onValueChange={(v) => alterarBotao(i, "queueId", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a fila..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filas.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}
                            {f.ativa ? "" : " (inativa)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-destructive hover:text-destructive"
                    aria-label="Remover botão"
                    onClick={() => setBotoes((a) => a.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))
            )}
            {filas.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Crie uma fila de atendimento acima para poder vincular aos botões.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void gravar()} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar menu"}
            </Button>
            <Input
              className="h-9 w-44"
              placeholder="Número para teste"
              value={numeroTeste}
              onChange={(e) => setNumeroTeste(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={enviando || !numeroTeste.trim()}
              onClick={() => void testar()}
            >
              <Send className="mr-1 size-3.5" />
              {enviando ? "Enviando..." : "Enviar teste"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
