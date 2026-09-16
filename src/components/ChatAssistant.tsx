import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Sou o assistente do CIOP. Como posso ajudar?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    // Simulated assistant reply
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Essa funcionalidade está em desenvolvimento. Em breve poderei responder suas dúvidas sobre o sistema!",
        },
      ]);
      setLoading(false);
    }, 1200);
  };

  return (
    <TooltipProvider>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
        {/* Chat panel */}
        {open && (
          <div className="mb-2 flex h-[min(28rem,calc(100vh-6rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-panel animate-in slide-in-from-bottom-2 fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-primary/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">Assistente IA</span>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-muted">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${
                    m.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Bot className="size-4" />
                  </div>
                  <div className="flex gap-1 rounded-xl bg-muted px-3 py-2">
                    <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                    <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border px-3 py-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Digite sua mensagem..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="default"
                  disabled={loading || !input.trim()}
                  className="size-9 shrink-0"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* FAB */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-primary/90"
              aria-label={open ? "Fechar assistente" : "Abrir assistente"}
            >
              {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{open ? "Fechar" : "Assistente IA"}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
