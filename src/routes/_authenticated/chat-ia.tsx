import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Send,
  X,
  Bot,
  User,
  Plus,
  Trash2,
  Pencil,
  Check,
  Copy,
  RefreshCw,
  ArrowLeft,
  Menu,
  MessageSquare,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAiChat, AI_PROVIDERS, type AiProviderChoice } from "@/hooks/use-ai-chat";
import type { AiMessage } from "@/lib/ai-chat-db";
import { hasManusKey } from "@/lib/manus-ai";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const PROVIDER_KEY = "chat-ia-provider-v1";

export const Route = createFileRoute("/_authenticated/chat-ia")({
  head: () => ({
    meta: [
      { title: "Chat Oficial com IA" },
      {
        name: "description",
        content: "Chat com IA integrada — escolha entre IA do Painel, Manus AI, Gemini ou OpenAI",
      },
    ],
  }),
  component: ChatIAPage,
});

/* ─── Markdown-lite renderer ─── */
function renderMarkdown(text: string): string {
  let html = text
    // Code blocks
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="bg-black/30 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"><code>$1</code></pre>',
    )
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-black/20 rounded px-1.5 py-0.5 text-xs font-mono">$1</code>',
    )
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>',
    )
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-3 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-3 mb-1">$1</h1>')
    // Unordered lists
    .replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n/g, "<br/>");

  // Wrap consecutive <li> in <ul>/<ol>
  html = html.replace(/(<li class="ml-4 list-disc">.*?<\/li>(<br\/>)?)+/g, (match) => {
    const items = match.replace(/<br\/>/g, "");
    return `<ul class="my-1">${items}</ul>`;
  });
  html = html.replace(/(<li class="ml-4 list-decimal">.*?<\/li>(<br\/>)?)+/g, (match) => {
    const items = match.replace(/<br\/>/g, "");
    return `<ol class="my-1">${items}</ol>`;
  });

  return html;
}

/* ─── Provider badge ─── */
function ProviderBadge({ provider, model }: { provider?: string | null; model?: string | null }) {
  if (!provider) return null;
  const mapa: Record<string, { color: string; label: string }> = {
    gemini: { color: "text-blue-400 bg-blue-500/10", label: "Gemini" },
    openai: { color: "text-emerald-400 bg-emerald-500/10", label: "OpenAI" },
    manus: { color: "text-amber-400 bg-amber-500/10", label: "Manus AI" },
    painel: { color: "text-indigo-400 bg-indigo-500/10", label: "IA do Painel" },
  };
  const { color, label } = mapa[provider] ?? {
    color: "text-muted-foreground bg-muted",
    label: provider,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      <Sparkles className="size-2.5" />
      {label}
      {model && <span className="opacity-60">· {model}</span>}
    </span>
  );
}

/* ─── Message bubble ─── */
function MessageBubble({
  message,
  onCopy,
  onRegenerate,
  isLast,
}: {
  message: AiMessage;
  onCopy: (content: string) => void;
  onRegenerate?: (() => void | Promise<void>) | undefined;
  isLast: boolean;
}) {
  const isUser = message.role === "user";
  const isError = message.status === "error";

  return (
    <div className={`group flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary/20 text-primary"
            : isError
              ? "bg-destructive/20 text-destructive"
              : "bg-violet-500/20 text-violet-400"
        }`}
      >
        {isUser ? (
          <User className="size-4" />
        ) : isError ? (
          <AlertCircle className="size-4" />
        ) : (
          <Bot className="size-4" />
        )}
      </div>
      <div className="flex max-w-[80%] flex-col gap-1">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : isError
                ? "bg-destructive/10 text-destructive rounded-bl-md border border-destructive/20"
                : "bg-muted text-foreground rounded-bl-md"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div
              className="prose-chat whitespace-pre-wrap break-words [&_pre]:whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
          )}
        </div>
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-muted-foreground">
            {new Date(message.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {!isUser && <ProviderBadge provider={message.provider} model={message.model} />}
          {!isUser && !isError && (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onCopy(message.content)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Copiar resposta"
              >
                <Copy className="size-3" />
              </button>
              {isLast && onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Gerar novamente"
                >
                  <RefreshCw className="size-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Typing indicator ─── */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-400">
        <Bot className="size-4" />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
          <div className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
          <div className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <div className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
        <span className="text-[10px] text-muted-foreground">IA está respondendo...</span>
      </div>
    </div>
  );
}

/* ─── Sidebar content (shared between mobile/desktop) ─── */
function SidebarContent({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: Array<{ id: string; title: string; provider: string | null; updated_at: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <Button onClick={onNew} variant="outline" size="sm" className="w-full gap-2">
          <Plus className="size-4" />
          Nova conversa
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma conversa ainda
            </p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
                conv.id === activeId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => {
                if (editingId !== conv.id) onSelect(conv.id);
              }}
            >
              <MessageSquare className="size-4 shrink-0 opacity-50" />
              {editingId === conv.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    className="flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onRename(conv.id, editTitle);
                        setEditingId(null);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(conv.id, editTitle);
                      setEditingId(null);
                    }}
                    className="rounded p-0.5 hover:bg-accent"
                  >
                    <Check className="size-3" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 truncate">{conv.title}</span>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(conv.id);
                        setEditTitle(conv.title);
                      }}
                      className="rounded p-0.5 hover:bg-accent"
                      title="Renomear"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(conv.id);
                      }}
                      className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
                      title="Excluir"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── Suggestions (reusable) ─── */
const SUGGESTIONS = [
  "O que o sistema faz?",
  "Como importar arquivos?",
  "Explique os KPIs",
  "Analise os dados de faltas",
];

/* ─── Main page ─── */
function ChatIAPage() {
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    isSending,
    error,
    newConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    sendMessage,
    cancelRequest,
    regenerateLastMessage,
  } = useAiChat();

  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<AiProviderChoice>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(PROVIDER_KEY) : null;
    return AI_PROVIDERS.some((p) => p.value === saved) ? (saved as AiProviderChoice) : "painel";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleProviderChange(value: string) {
    const escolhido = value as AiProviderChoice;
    setProvider(escolhido);
    try {
      localStorage.setItem(PROVIDER_KEY, escolhido);
    } catch {
      /* storage indisponível */
    }
    if (escolhido === "manus" && !hasManusKey()) {
      toast.warning(
        "Configure a chave da Manus AI no card 'Manus AI', em IA Operacional › Integrações.",
      );
    }
  }

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isSending]);

  // Focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeConversationId]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    // Clear input immediately for responsiveness
    const messageToSend = trimmed;
    setInput("");
    try {
      await sendMessage(messageToSend, provider);
    } catch (err) {
      console.error("[ChatIA] handleSend error:", err);
      toast.error("Erro ao enviar mensagem. Tente novamente.");
      // Restore input so the user doesn't lose their message
      setInput(messageToSend);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleCopy(content: string) {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        toast.success("Resposta copiada!");
      })
      .catch(() => {
        toast.error("Falha ao copiar");
      });
  }

  function handleSelectConv(id: string) {
    selectConversation(id);
    setMobileMenuOpen(false);
  }

  async function handleNew() {
    try {
      await newConversation();
      setMobileMenuOpen(false);
    } catch (err) {
      toast.error("Erro ao criar conversa. Tente novamente.");
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setInput(suggestion);
    textareaRef.current?.focus();
  }

  const lastAssistantIdx = [...messages]
    .reverse()
    .findIndex((m) => m.role === "assistant" && m.status !== "error");
  const lastAssistantId =
    lastAssistantIdx >= 0 ? messages[messages.length - 1 - lastAssistantIdx]?.id : null;

  const canSend = input.trim().length > 0 && !isSending;
  const hasMessages = messages.length > 0 || isLoading;

  return (
    <main className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 flex-shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border p-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Voltar ao painel
          </Link>
        </div>
        <SidebarContent
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConv}
          onNew={handleNew}
          onRename={renameConversation}
          onDelete={deleteConversation}
        />
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          {/* Mobile menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="border-b border-border p-4">
                <Link
                  to="/"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="size-4" />
                  Voltar ao painel
                </Link>
              </div>
              <SidebarContent
                conversations={conversations}
                activeId={activeConversationId}
                onSelect={handleSelectConv}
                onNew={handleNew}
                onRename={renameConversation}
                onDelete={deleteConversation}
              />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Chat Oficial com IA</h1>
              <p className="text-xs text-muted-foreground">
                {activeConversationId
                  ? (conversations.find((c) => c.id === activeConversationId)?.title ?? "Conversa")
                  : "Inicie uma conversa digitando abaixo"}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">IA:</span>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-9 w-[9.5rem] text-xs" aria-label="Escolher IA">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    <span className="flex flex-col">
                      <span className="font-medium">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">{p.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
          {!activeConversationId && !hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-indigo-500/10">
                <Sparkles className="size-10 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Chat Oficial com IA</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Converse com a IA integrada ao sistema. Usa automaticamente Gemini ou OpenAI, com
                  fallback inteligente entre os provedores.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : activeConversationId && messages.length === 0 && !isLoading && !isSending ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-indigo-500/10">
                <Bot className="size-8 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Como posso ajudar?</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Pergunte sobre o sistema, peça análises de dados, explicações de KPIs ou sugestões
                  de correções.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onCopy={handleCopy}
                  onRegenerate={
                    msg.id === lastAssistantId
                      ? () => void regenerateLastMessage(provider)
                      : undefined
                  }
                  isLast={msg.id === lastAssistantId}
                />
              ))}
              {isSending && <TypingIndicator />}
              {error && !isSending && (
                <div className="mx-auto flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2">
                  <AlertCircle className="size-4 text-destructive" />
                  <span className="text-xs text-destructive">{error}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-6 text-xs"
                    onClick={() => {
                      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                      if (lastUserMsg) void sendMessage(lastUserMsg.content, provider);
                    }}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input area — always visible */}
        <div className="border-t border-border px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isSending ? "Aguarde a resposta..." : "Digite sua mensagem..."}
              className="max-h-32 min-h-[40px] resize-none rounded-xl border-muted bg-muted/50 text-sm"
              rows={1}
              disabled={isSending}
            />
            {isSending ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={cancelRequest}
                className="shrink-0"
                title="Parar"
              >
                <X className="size-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => void handleSend()}
                disabled={!canSend}
                className="shrink-0 rounded-xl"
                title="Enviar"
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            {isSending
              ? "IA está respondendo..."
              : "Shift+Enter para nova linha · Enter para enviar"}
          </p>
        </div>
      </div>
    </main>
  );
}
