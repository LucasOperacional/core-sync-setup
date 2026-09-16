import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  RefreshCw,
  Search,
  Send,
  Share2,
  UserCheck,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  responderDirectNexti,
  sincronizarDirectNexti,
  sincronizarMensagensDirect,
} from "@/lib/chat-direct.functions";
import {
  assumirDirect,
  finalizarDirect,
  listDirectConversations,
  listDirectMessages,
  transferirDirect,
  type DirectConversation,
  type DirectMessage,
} from "@/lib/chat-direct-db";
import type { UserProfile } from "@/lib/chat-interno-db";

interface ChatDirectProps {
  currentUserId: string;
  userProfiles: Record<string, UserProfile>;
}

const STATUS_LABEL: Record<DirectConversation["status"], string> = {
  aberta: "Aguardando",
  em_atendimento: "Em atendimento",
  finalizada: "Finalizada",
};

export function ChatDirect({ currentUserId, userProfiles }: ChatDirectProps) {
  const sincronizar = useServerFn(sincronizarDirectNexti);

  const [conversas, setConversas] = useState<DirectConversation[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<DirectMessage[]>([]);
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [destino, setDestino] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [avisoMensagens, setAvisoMensagens] = useState<string | null>(null);

  const responder = useServerFn(responderDirectNexti);
  const sincronizarMensagens = useServerFn(sincronizarMensagensDirect);

  const alternarGrupo = (nome: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(nome)) proximo.delete(nome);
      else proximo.add(nome);
      return proximo;
    });

  const carregarConversas = useCallback(async () => {
    try {
      setConversas(await listDirectConversations());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  const sincronizarAgora = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar({});
      if (!r.ok && r.erro) setErro(r.erro);
      else setUltimaSync(new Date());

      const m = await sincronizarMensagens({});
      setAvisoMensagens(
        m.ok
          ? m.recebidas > 0
            ? `${m.recebidas} mensagem(ns) trazidas do Direct da NEXTI.`
            : null
          : (m.erro ??
              "A NEXTI ainda não disponibiliza a leitura das mensagens do Direct para esta conta — por enquanto só é possível enviar mensagens por aqui."),
      );

      await carregarConversas();
      if (ativa) setMensagens(await listDirectMessages(ativa));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  }, [sincronizar, sincronizarMensagens, carregarConversas, ativa]);

  // Sincroniza automaticamente ao abrir e a cada 5 minutos
  useEffect(() => {
    void sincronizarAgora();
    const t = setInterval(() => void sincronizarAgora(), 5 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca no Direct da NEXTI as mensagens novas a cada minuto
  useEffect(() => {
    const buscar = async () => {
      try {
        const m = await sincronizarMensagens({});
        if (m.ok && m.recebidas > 0) {
          await carregarConversas();
          if (ativa) setMensagens(await listDirectMessages(ativa));
        }
      } catch {
        /* silencioso: o aviso já aparece na sincronização manual */
      }
    };
    const t = setInterval(() => void buscar(), 60_000);
    return () => clearInterval(t);
  }, [sincronizarMensagens, carregarConversas, ativa]);

  useEffect(() => {
    if (!ativa) {
      setMensagens([]);
      return;
    }
    let cancelado = false;
    const carregar = async () => {
      try {
        const m = await listDirectMessages(ativa);
        if (!cancelado) setMensagens(m);
      } catch {
        /* ignora */
      }
    };
    void carregar();
    const t = setInterval(() => void carregar(), 10000);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, [ativa]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return conversas;
    return conversas.filter((c) =>
      [c.contato_nome, c.contato_posto, c.contato_cargo, c.contato_matricula]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [conversas, busca]);

  /** Conversas agrupadas pelo posto/local do contato. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, DirectConversation[]>();
    for (const c of filtradas) {
      const nome = c.contato_posto?.trim() || "Sem posto definido";
      const lista = mapa.get(nome);
      if (lista) lista.push(c);
      else mapa.set(nome, [c]);
    }
    return [...mapa.entries()]
      .map(([nome, itens]) => ({ nome, itens }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [filtradas]);

  const conversaAtiva = conversas.find((c) => c.id === ativa) ?? null;
  const nomeDe = (id: string | null) =>
    id ? (userProfiles[id]?.display_name ?? "Membro da equipe") : "Ninguém";

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !ativa) return;
    setTexto("");
    setEnviando(true);
    try {
      const r = await responder({ data: { conversationId: ativa, texto: t } });
      if (!r.ok) setErro(r.erro ?? "Não foi possível registrar a mensagem.");
      else if (!r.entregue)
        setErro(
          r.erro
            ? `Mensagem salva, mas a NEXTI não recebeu: ${r.erro}`
            : "Mensagem salva, mas a NEXTI não confirmou a entrega.",
        );
      else setErro(null);
      setMensagens(await listDirectMessages(ativa));
      await carregarConversas();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  const confirmarTransferencia = async () => {
    if (!ativa) return;
    try {
      await transferirDirect(ativa, destino || null, motivo.trim() || undefined);
      setTransferOpen(false);
      setMotivo("");
      setDestino("");
      await carregarConversas();
      setMensagens(await listDirectMessages(ativa));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">DIRECT</h2>
        <Badge variant="secondary" className="text-[10px]">
          {conversas.length} conversas
        </Badge>
        <span className="text-xs text-muted-foreground">
          {sincronizando
            ? "Sincronizando com a NEXTI..."
            : ultimaSync
              ? `Atualizado às ${ultimaSync.toLocaleTimeString("pt-BR")}`
              : "Sincronização automática ativa"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void sincronizarAgora()}
          disabled={sincronizando}
        >
          {sincronizando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Atualizar
        </Button>
      </div>

      {erro && (
        <p className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {erro}
        </p>
      )}

      {avisoMensagens && (
        <p className="border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
          {avisoMensagens}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <div className="flex w-full max-w-xs flex-col border-r border-border">
          <div className="relative p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar contato..."
              className="pl-9"
            />
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {carregando && (
                <p className="px-2 py-4 text-xs text-muted-foreground">Carregando conversas...</p>
              )}
              {!carregando && filtradas.length === 0 && (
                <p className="px-2 py-4 text-xs text-muted-foreground">
                  Nenhuma conversa encontrada.
                </p>
              )}
              {grupos.map((grupo) => {
                const aberto = busca.trim() !== "" || abertos.has(grupo.nome);
                return (
                  <div key={grupo.nome} className="rounded-lg border border-border/60">
                    <button
                      onClick={() => alternarGrupo(grupo.nome)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-muted"
                      aria-expanded={aberto}
                    >
                      <ChevronRight
                        className={`size-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{grupo.nome}</span>
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {grupo.itens.length}
                      </Badge>
                    </button>

                    {aberto && (
                      <div className="space-y-1 p-1">
                        {grupo.itens.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setAtiva(c.id)}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              ativa === c.id
                                ? "bg-teal-500/15 text-teal-300"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <span className="block truncate font-medium">{c.contato_nome}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {c.contato_cargo ?? "Sem cargo"}
                            </span>
                            <span className="mt-1 flex items-center gap-1 text-[10px]">
                              <Badge
                                variant={c.status === "aberta" ? "destructive" : "secondary"}
                                className="px-1.5 py-0 text-[10px]"
                              >
                                {STATUS_LABEL[c.status]}
                              </Badge>
                              {c.assigned_to && <span>{nomeDe(c.assigned_to)}</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Conversa */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!conversaAtiva ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Selecione uma conversa DIRECT para atender ou transferir.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{conversaAtiva.contato_nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[conversaAtiva.contato_cargo, conversaAtiva.contato_posto]
                      .filter(Boolean)
                      .join(" · ") || "Sem lotação"}
                    {conversaAtiva.contato_matricula
                      ? ` · Matrícula ${conversaAtiva.contato_matricula}`
                      : ""}
                  </p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    Responsável: {nomeDe(conversaAtiva.assigned_to)}
                  </Badge>
                  {conversaAtiva.assigned_to !== currentUserId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await assumirDirect(conversaAtiva.id);
                        await carregarConversas();
                      }}
                    >
                      <UserCheck className="size-4" />
                      Assumir
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
                    <Share2 className="size-4" />
                    Transferir
                  </Button>
                  {conversaAtiva.status !== "finalizada" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await finalizarDirect(conversaAtiva.id);
                        await carregarConversas();
                      }}
                    >
                      <CheckCircle2 className="size-4" />
                      Finalizar
                    </Button>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-3 p-4">
                  {mensagens.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma mensagem nesta conversa ainda.
                    </p>
                  )}
                  {mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        m.autor === "sistema"
                          ? "mx-auto bg-muted text-center text-xs text-muted-foreground"
                          : m.user_id === currentUserId
                            ? "ml-auto bg-teal-500/15 text-foreground"
                            : "bg-muted text-foreground"
                      }`}
                    >
                      {m.autor !== "sistema" && (
                        <p className="mb-0.5 text-[10px] text-muted-foreground">
                          {m.autor === "contato"
                            ? conversaAtiva.contato_nome
                            : m.user_id
                              ? nomeDe(m.user_id)
                              : "Direct NEXTI"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      {m.autor === "agente" && m.entregue === false && (
                        <p className="mt-1 text-[10px] text-destructive">
                          Não entregue na NEXTI{m.erro_envio ? ` — ${m.erro_envio}` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex items-center gap-2 border-t border-border p-3">
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  placeholder="Responda o Direct da NEXTI..."
                  disabled={enviando}
                />
                <Button onClick={() => void enviar()} disabled={!texto.trim() || enviando}>
                  {enviando ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Devolver para a fila</option>
              {Object.values(userProfiles)
                .filter((p) => p.id !== conversaAtiva?.assigned_to)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
            </select>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da transferência (opcional)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarTransferencia()}>Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
