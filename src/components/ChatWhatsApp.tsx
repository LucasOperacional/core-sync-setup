import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Loader2,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Share2,
  Square,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  whatsappAtualizarFotos,
  whatsappAudioUrl,
  whatsappEnviarAudio,
  whatsappEnviarMensagem,
  whatsappObterAssinatura,
  whatsappSalvarAssinatura,
  whatsappSincronizarConversas,
  whatsappStatus,
  type WhatsAppStatus,
} from "@/lib/whatsapp.functions";
import {
  apagarMensagemWhatsApp,
  apagarWhatsApp,
  assumirWhatsApp,
  finalizarWhatsApp,
  listWhatsAppConversations,
  listWhatsAppMessages,
  marcarWhatsAppLida,
  transferirWhatsApp,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "@/lib/whatsapp-db";
import type { UserProfile } from "@/lib/chat-interno-db";

interface ChatWhatsAppProps {
  currentUserId: string;
  userProfiles: Record<string, UserProfile>;
}

const STATUS_LABEL: Record<WhatsAppConversation["status"], string> = {
  aberta: "Aguardando",
  em_atendimento: "Em atendimento",
  finalizada: "Finalizada",
};

/** Iniciais usadas quando o contato não tem foto de perfil. */
function iniciais(nome: string | null): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "?";
  const partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return `${partes[0]![0]}${partes[partes.length - 1]![0]}`.toUpperCase();
}


/** Player de um áudio guardado no armazenamento interno. */
function AudioMensagem({ caminho }: { caminho: string }) {
  const obterUrl = useServerFn(whatsappAudioUrl);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const r = await obterUrl({ data: { caminho } });
        if (!cancelado) setUrl(r.url);
      } catch {
        /* áudio indisponível */
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho]);

  if (!url) {
    return <p className="mt-1 text-[11px] text-muted-foreground">Carregando áudio...</p>;
  }
  return <audio controls src={url} className="mt-1 h-9 w-56 max-w-full" />;
}

export function ChatWhatsApp({ currentUserId, userProfiles }: ChatWhatsAppProps) {
  const buscarStatus = useServerFn(whatsappStatus);
  const sincronizar = useServerFn(whatsappSincronizarConversas);
  const enviarServidor = useServerFn(whatsappEnviarMensagem);
  const atualizarFotos = useServerFn(whatsappAtualizarFotos);

  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [conversas, setConversas] = useState<WhatsAppConversation[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<WhatsAppMessage[]>([]);
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [apagarId, setApagarId] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [assinaturaTexto, setAssinaturaTexto] = useState("");
  const [apagandoMsgId, setApagandoMsgId] = useState<string | null>(null);

  async function apagarMensagem(id: string) {
    if (!window.confirm("Apagar esta mensagem por completo?")) return;
    setApagandoMsgId(id);
    try {
      await apagarMensagemWhatsApp(id);
      setMensagens((lista) => lista.filter((msg) => msg.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao apagar a mensagem.");
    } finally {
      setApagandoMsgId(null);
    }
  }

  const obterAssinatura = useServerFn(whatsappObterAssinatura);
  const salvarAssinatura = useServerFn(whatsappSalvarAssinatura);

  useEffect(() => {
    void (async () => {
      try {
        const a = await obterAssinatura({});
        setAssinaturaAtiva(a.ativa);
        setAssinaturaTexto(a.texto);
      } catch {
        /* ignora */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gravarAssinatura = async (ativa: boolean, txt: string) => {
    setAssinaturaAtiva(ativa);
    setAssinaturaTexto(txt);
    try {
      await salvarAssinatura({ data: { ativa, texto: txt } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const apagarConversa = async () => {
    if (!apagarId) return;
    setApagando(true);
    try {
      await apagarWhatsApp(apagarId);
      if (ativa === apagarId) {
        setAtiva(null);
        setMensagens([]);
      }
      setApagarId(null);
      await carregarConversas();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setApagando(false);
    }
  };

  const carregarConversas = useCallback(async () => {
    try {
      setConversas(await listWhatsAppConversations());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  const atualizarTudo = useCallback(async () => {
    setAtualizando(true);
    try {
      const [st, sync] = await Promise.all([buscarStatus({}), sincronizar({})]);
      setStatus(st);
      const problema = st.erro ?? sync.erro ?? null;
      setErro(problema);
      await carregarConversas();
      // Fotos de perfil: busca em segundo plano e recarrega a lista quando vierem.
      void atualizarFotos({})
        .then((r) => (r.atualizadas > 0 ? carregarConversas() : undefined))
        .catch(() => undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAtualizando(false);
    }
  }, [buscarStatus, sincronizar, carregarConversas, atualizarFotos]);

  useEffect(() => {
    void atualizarTudo();
    const t = setInterval(() => void atualizarTudo(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ativa) {
      setMensagens([]);
      return;
    }
    let cancelado = false;
    const carregar = async () => {
      try {
        const m = await listWhatsAppMessages(ativa);
        if (!cancelado) setMensagens(m);
      } catch {
        /* ignora */
      }
    };
    void carregar();
    void marcarWhatsAppLida(ativa);
    const t = setInterval(() => void carregar(), 8000);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, [ativa]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return conversas;
    return conversas.filter((c) =>
      [c.contato_nome, c.telefone, c.last_message_preview]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [conversas, busca]);

  const conversaAtiva = conversas.find((c) => c.id === ativa) ?? null;
  const nomeDe = (id: string | null) =>
    id ? (userProfiles[id]?.display_name ?? "Membro da equipe") : "Ninguém";

  useEffect(() => {
    if (!ativa && conversas.length > 0) {
      setAtiva(conversas[0]?.id ?? null);
    }
  }, [ativa, conversas]);

  const enviarAudioServidor = useServerFn(whatsappEnviarAudio);

  /** Começa a gravar pelo microfone; ao parar, o áudio vai direto para o contato. */
  const iniciarGravacao = async () => {
    if (!conversaAtiva) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "";
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      const pedacos: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const blob = new Blob(pedacos, { type: rec.mimeType || "audio/ogg" });
        if (blob.size < 1000) return;
        setEnviandoAudio(true);
        try {
          const buffer = await blob.arrayBuffer();
          let bin = "";
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const r = await enviarAudioServidor({
            data: {
              conversationId: conversaAtiva.id,
              chatId: conversaAtiva.wa_chat_id,
              base64: btoa(bin),
              mime: blob.type,
            },
          });
          if (!r.ok) setErro(r.erro ?? "Não foi possível enviar o áudio.");
          setMensagens(await listWhatsAppMessages(conversaAtiva.id));
          await carregarConversas();
        } catch (e) {
          setErro(e instanceof Error ? e.message : String(e));
        } finally {
          setEnviandoAudio(false);
        }
      };
      gravadorRef.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      setErro("Não foi possível usar o microfone. Permita o acesso no navegador.");
    }
  };

  const pararGravacao = () => {
    gravadorRef.current?.stop();
    gravadorRef.current = null;
  };

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !conversaAtiva) return;
    setEnviando(true);
    setTexto("");
    try {
      const r = await enviarServidor({
        data: { conversationId: conversaAtiva.id, chatId: conversaAtiva.wa_chat_id, texto: t },
      });
      if (!r.ok) setErro(r.erro ?? "Não foi possível enviar a mensagem.");
      setMensagens(await listWhatsAppMessages(conversaAtiva.id));
      await carregarConversas();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  const confirmarTransferencia = async () => {
    if (!conversaAtiva) return;
    try {
      await transferirWhatsApp(conversaAtiva.id, destino || null, motivo.trim() || undefined);
      setTransferOpen(false);
      setDestino("");
      setMotivo("");
      await carregarConversas();
      setMensagens(await listWhatsAppMessages(conversaAtiva.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">WhatsApp</h2>
        <Badge variant={status?.conectado ? "secondary" : "destructive"} className="text-[10px]">
          {status?.conectado
            ? `Conectado${status.numero ? ` · ${status.numero}` : ""}`
            : (status?.estado ?? "Desconectado")}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {conversas.length} conversas
        </Badge>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void atualizarTudo()}
          disabled={atualizando}
        >
          {atualizando ? (
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

      {!status?.conectado && status?.qrCode && (
        <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">
            Leia o código no WhatsApp do celular para conectar:
          </p>
          <img
            src={
              status.qrCode.startsWith("data:")
                ? status.qrCode
                : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(status.qrCode)}`
            }
            alt="Código para conectar o WhatsApp"
            className="size-[220px] rounded-md bg-white p-2"
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex w-full max-w-xs flex-col border-r border-border">
          <div className="relative p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa..."
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
                  Nenhuma conversa ainda. Assim que o número receber mensagens elas aparecem aqui.
                </p>
              )}
              {filtradas.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setAtiva(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setAtiva(c.id);
                    }
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    ativa === c.id
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Avatar className="size-8 shrink-0">
                      {c.foto_url ? (
                        <AvatarImage src={c.foto_url} alt={c.contato_nome ?? "Contato"} />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {iniciais(c.contato_nome ?? c.telefone)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate font-medium">
                      {c.contato_nome ?? c.telefone}
                    </span>
                    {c.nao_lidas > 0 && (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                        {c.nao_lidas}
                      </Badge>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Apagar conversa"
                      aria-label="Apagar conversa"
                      className="ml-auto size-7 shrink-0 border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setApagarId(c.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.last_message_preview ?? c.telefone}
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
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {!conversaAtiva ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Selecione uma conversa do WhatsApp para responder ou transferir.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <Avatar className="size-9 shrink-0">
                  {conversaAtiva.foto_url ? (
                    <AvatarImage
                      src={conversaAtiva.foto_url}
                      alt={conversaAtiva.contato_nome ?? "Contato"}
                    />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {iniciais(conversaAtiva.contato_nome ?? conversaAtiva.telefone)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {conversaAtiva.contato_nome ?? conversaAtiva.telefone}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {conversaAtiva.telefone}
                    {conversaAtiva.is_group ? " · grupo" : ""}
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
                        await assumirWhatsApp(conversaAtiva.id);
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
                        await finalizarWhatsApp(conversaAtiva.id);
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
                      Nenhuma mensagem nesta conversa.
                    </p>
                  )}
                  {mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={`group relative max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        m.direcao === "sistema"
                          ? "mx-auto bg-muted text-center text-xs text-muted-foreground"
                          : m.direcao === "enviada"
                            ? "ml-auto bg-emerald-500/15 text-foreground"
                            : "bg-muted text-foreground"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label="Apagar mensagem"
                        title="Apagar mensagem"
                        className="absolute -top-2 right-1 hidden rounded-full bg-background p-1 text-muted-foreground shadow group-hover:block hover:text-destructive"
                        disabled={apagandoMsgId === m.id}
                        onClick={() => void apagarMensagem(m.id)}
                      >
                        {apagandoMsgId === m.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                      </button>
                      {m.direcao !== "sistema" && (
                        <p className="mb-0.5 text-[10px] text-muted-foreground">
                          {m.direcao === "enviada"
                            ? nomeDe(m.user_id)
                            : (m.autor_nome ?? conversaAtiva.contato_nome ?? "Contato")}
                        </p>
                      )}
                      {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                      {m.media_type === "audio" && m.media_url && (
                        <AudioMensagem caminho={m.media_url} />
                      )}
                      {m.media_type === "audio" && !m.media_url && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Mensagem de voz (não foi possível baixar o áudio).
                        </p>
                      )}
                      {m.media_url && m.media_type !== "audio" && (
                        <a
                          href={m.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs underline"
                        >
                          <Paperclip className="size-3" />
                          Ver anexo
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
                <div className="flex shrink-0 items-center gap-2 rounded-md border border-border px-2 py-1">
                  <Switch
                    id="assinatura-whatsapp"
                    checked={assinaturaAtiva}
                    onCheckedChange={(v) => void gravarAssinatura(v, assinaturaTexto)}
                  />
                  <Label htmlFor="assinatura-whatsapp" className="whitespace-nowrap text-[11px]">
                    Assinar mensagens
                  </Label>
                  {assinaturaAtiva && (
                    <Input
                      value={assinaturaTexto}
                      onChange={(e) => setAssinaturaTexto(e.target.value)}
                      onBlur={() => void gravarAssinatura(true, assinaturaTexto)}
                      placeholder="Seu nome"
                      className="h-7 w-40 text-xs"
                    />
                  )}
                </div>
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  placeholder="Escreva a resposta do WhatsApp..."
                  disabled={enviando}
                  className="min-w-48 flex-1"
                />
                <Button
                  type="button"
                  variant={gravando ? "destructive" : "outline"}
                  size="icon"
                  title={gravando ? "Parar e enviar o áudio" : "Gravar um áudio"}
                  aria-label={gravando ? "Parar e enviar o áudio" : "Gravar um áudio"}
                  onClick={() => (gravando ? pararGravacao() : void iniciarGravacao())}
                  disabled={enviandoAudio}
                >
                  {enviandoAudio ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : gravando ? (
                    <Square className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                </Button>
                {gravando && (
                  <span className="text-[11px] text-destructive">Gravando... clique para enviar</span>
                )}
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
            <DialogTitle>Transferir conversa do WhatsApp</DialogTitle>
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

      <Dialog open={apagarId !== null} onOpenChange={(o) => !o && setApagarId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar conversa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza? Todas as mensagens desta conversa serão apagadas permanentemente. Essa
            ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApagarId(null)} disabled={apagando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void apagarConversa()} disabled={apagando}>
              {apagando ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
