import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Home,
  Zap,
  Send,
  X,
  Bot,
  User,
  Copy,
  Trash2,
  Plus,
  Pencil,
  Check,
  BookOpen,
  MessageSquare,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Plug,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useIaOperacionalChat, type ChatMessage } from "@/hooks/use-ia-operacional-chat";
import {
  listTrainingData,
  createTrainingData,
  updateTrainingData,
  deleteTrainingData,
  type TrainingData,
} from "@/lib/ia-operacional-chat-db";
import { NextiConfigCard } from "@/components/NextiConfigCard";

import { GeminiConfigCard } from "@/components/GeminiConfigCard";
import { OpenAIConfigCard } from "@/components/OpenAIConfigCard";
import { ManusConfigCard } from "@/components/ManusConfigCard";
import { SecurityDashboard } from "@/components/SecurityDashboard";

export const Route = createFileRoute("/_authenticated/ia-operacional")({
  head: () => ({
    meta: [
      { title: "IA Operacional" },
      {
        name: "description",
        content:
          "Chat inteligente com IA integrada ao Gemini, treinamento, integrações, segurança e monitoramento do sistema.",
      },
    ],
  }),
  component: IaOperacionalPage,
});

/* ─── Quick questions ─── */
const QUICK_QUESTIONS = [
  "Quantos funcionários estão ativos?",
  "Quantos funcionários estão em audiência?",
  "Quantas folhas de ponto faltam protocolar?",
  "Quais folhas já foram protocoladas?",
  "Quais empresas possuem protocolos pendentes?",
  "Quantas faltas foram registradas no período?",
  "Existem inconsistências nos arquivos importados?",
  "Resuma os indicadores operacionais de hoje.",
  "Analise este atestado e informe possíveis inconsistências.",
  "Como corrigir um erro de importação?",
  "Quais dados precisam de atenção urgente?",
  "Gere um relatório resumido do painel.",
];

/* ─── Markdown-lite renderer ─── */
function renderMarkdown(text: string): string {
  let html = text
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="bg-black/30 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"><code>$1</code></pre>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-black/20 rounded px-1.5 py-0.5 text-xs font-mono">$1</code>',
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>',
    )
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-3 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-3 mb-1">$1</h1>')
    .replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\n/g, "<br/>");

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

/* ─── Typing effect component ─── */
function TypingText({ content, onDone }: { content: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      indexRef.current += 3;
      if (indexRef.current >= content.length) {
        setDisplayed(content);
        clearInterval(interval);
        onDone?.();
      } else {
        setDisplayed(content.slice(0, indexRef.current));
      }
    }, 10);
    return () => clearInterval(interval);
  }, [content, onDone]);

  return (
    <div
      className="prose-chat whitespace-pre-wrap break-words [&_pre]:whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(displayed) }}
    />
  );
}

/* ─── Message bubble ─── */
function MessageBubble({
  message,
  onCopy,
  isLast,
}: {
  message: ChatMessage;
  onCopy: (content: string) => void;
  isLast: boolean;
}) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const isNew = isLast && message.role === "assistant" && message.status === "done";
  const [typingDone, setTypingDone] = useState(!isNew);

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
          ) : isNew && !typingDone ? (
            <TypingText content={message.content} onDone={() => setTypingDone(true)} />
          ) : (
            <div
              className="prose-chat whitespace-pre-wrap break-words [&_pre]:whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
          )}
        </div>
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
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
        <span className="text-[10px] text-muted-foreground">IA está processando...</span>
      </div>
    </div>
  );
}

/* ─── Training Tab ─── */
function TrainingTab() {
  const [items, setItems] = useState<TrainingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState<"instruction" | "qa_example" | "context">("instruction");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await listTrainingData();
      setItems(data);
    } catch (err: any) {
      const msg = err?.message || "Erro ao carregar dados de treinamento.";
      toast.error(msg);
      console.error("[TrainingTab] loadItems error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  function resetForm() {
    setCategory("instruction");
    setTitle("");
    setContent("");
    setQuestion("");
    setAnswer("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(item: TrainingData) {
    setEditingId(item.id);
    setCategory(item.category);
    setTitle(item.title);
    setContent(item.content);
    setQuestion(item.question ?? "");
    setAnswer(item.answer ?? "");
    setShowForm(true);
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Preencha o título.");
      return;
    }
    if (!content.trim()) {
      toast.error("Preencha o conteúdo.");
      return;
    }
    if (category === "qa_example" && !question.trim()) {
      toast.error("Preencha a pergunta de exemplo para a categoria Pergunta/Resposta.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category,
        title: title.trim(),
        content: content.trim(),
        ...(question.trim() ? { question: question.trim() } : {}),
        ...(answer.trim() ? { answer: answer.trim() } : {}),
      };
      if (editingId) {
        await updateTrainingData(editingId, payload);
        toast.success("Dados de treinamento atualizados com sucesso.");
      } else {
        await createTrainingData(payload);
        toast.success("Dados de treinamento cadastrados com sucesso.");
      }
      resetForm();
      await loadItems();
    } catch (err: any) {
      const msg = err?.message || "Erro ao salvar dados de treinamento.";
      toast.error(msg);
      console.error("[TrainingTab] handleSave error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item: TrainingData) {
    try {
      await updateTrainingData(item.id, { active: !item.active });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)));
      toast.success(item.active ? "Desativado com sucesso." : "Ativado com sucesso.");
    } catch (err: any) {
      const msg = err?.message || "Erro ao atualizar status.";
      toast.error(msg);
      console.error("[TrainingTab] handleToggleActive error:", err);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Tem certeza que deseja excluir este dado de treinamento?")) return;
    try {
      await deleteTrainingData(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Excluído com sucesso.");
    } catch (err: any) {
      const msg = err?.message || "Erro ao excluir.";
      toast.error(msg);
      console.error("[TrainingTab] handleDelete error:", err);
    }
  }

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "instruction":
        return "Instrução";
      case "qa_example":
        return "Pergunta/Resposta";
      case "context":
        return "Contexto";
      default:
        return cat;
    }
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "instruction":
        return "bg-blue-500/10 text-blue-400";
      case "qa_example":
        return "bg-emerald-500/10 text-emerald-400";
      case "context":
        return "bg-amber-500/10 text-amber-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Dados de Treinamento</h3>
          <p className="text-xs text-muted-foreground">
            Cadastre instruções, perguntas/respostas de exemplo e contexto. Esses dados são enviados
            como contexto para o Gemini.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadItems()}
            disabled={loading}
            className="gap-1.5 text-xs"
            title="Recarregar lista"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            Novo
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {editingId ? "Editar dado de treinamento" : "Novo dado de treinamento"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instruction">Instrução</SelectItem>
                  <SelectItem value="qa_example">Pergunta/Resposta</SelectItem>
                  <SelectItem value="context">Contexto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Regra sobre folhas de ponto"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Conteúdo / Instrução *</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Descreva a instrução ou contexto..."
                className="min-h-[80px] text-xs"
              />
            </div>

            {category === "qa_example" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pergunta de exemplo *</Label>
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ex: Quantos funcionários estão ativos?"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Resposta esperada</Label>
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="A resposta que a IA deveria dar..."
                    className="min-h-[60px] text-xs"
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
          <BookOpen className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum dado de treinamento cadastrado. Adicione instruções e exemplos para melhorar as
            respostas da IA.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card
              key={item.id}
              className={`transition-opacity ${!item.active ? "opacity-50" : ""}`}
            >
              <CardContent className="flex items-start gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${categoryColor(item.category)}`}
                    >
                      {categoryLabel(item.category)}
                    </Badge>
                    <span className="text-xs font-medium text-foreground truncate">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.content}</p>
                  {item.category === "qa_example" && item.question && (
                    <p className="text-[10px] text-muted-foreground mt-1">P: {item.question}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(item)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    title={item.active ? "Desativar" : "Ativar"}
                  >
                    {item.active ? (
                      <ToggleRight className="size-4 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    title="Editar"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    title="Excluir"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Integrations Tab ─── */
function IntegrationsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Integrações de API</h3>
        <p className="text-xs text-muted-foreground">
          Configure as chaves e credenciais das APIs externas utilizadas pelo sistema. As
          credenciais sao salvas localmente no navegador.
        </p>
      </div>

      <NextiConfigCard />
      <ManusConfigCard />
      <GeminiConfigCard />
      <OpenAIConfigCard />
    </div>
  );
}

/* ─── Main page ─── */
function IaOperacionalPage() {
  const { messages, isSending, error, sendMessage, cancelRequest, clearChat } =
    useIaOperacionalChat();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isSending]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    const messageToSend = trimmed;
    setInput("");
    try {
      await sendMessage(messageToSend);
    } catch {
      toast.error("Erro ao enviar mensagem.");
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
      .then(() => toast.success("Resposta copiada!"))
      .catch(() => toast.error("Falha ao copiar"));
  }

  function handleQuickQuestion(q: string) {
    setInput(q);
    textareaRef.current?.focus();
  }

  const canSend = input.trim().length > 0 && !isSending;
  const hasMessages = messages.length > 0;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <Zap className="size-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">IA Operacional</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Chat inteligente com Gemini, treinamento, integrações, segurança e monitoramento do
              sistema.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageSquare className="size-4" />
              Chat IA
            </TabsTrigger>
            <TabsTrigger value="training" className="gap-1.5">
              <BookOpen className="size-4" />
              Treinamento
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <Plug className="size-4" />
              Integrações
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              <Shield className="size-4" />
              Segurança
            </TabsTrigger>
          </TabsList>

          {/* ─── Chat tab ─── */}
          <TabsContent value="chat" className="space-y-0">
            <Card className="flex flex-col" style={{ height: "calc(100vh - 260px)" }}>
              <CardHeader className="border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-5 text-violet-400" />
                    <div>
                      <CardTitle className="text-sm">Chat com IA Operacional</CardTitle>
                      <CardDescription className="text-xs">
                        Pergunte sobre indicadores, relatórios, erros ou peça análises.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {isSending && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelRequest}
                        className="gap-1.5 text-xs text-destructive hover:text-destructive"
                      >
                        <X className="size-3.5" />
                        Cancelar
                      </Button>
                    )}
                    {hasMessages && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearChat}
                        className="gap-1.5 text-xs"
                        disabled={isSending}
                      >
                        <Trash2 className="size-3.5" />
                        Limpar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
                {!hasMessages ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 py-10">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-500/10">
                      <Bot className="size-8 text-violet-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Como posso ajudar?</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Faça uma pergunta ou use uma sugestão abaixo.
                      </p>
                    </div>
                    <div className="grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                      {QUICK_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => handleQuickQuestion(q)}
                          className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary hover:text-foreground"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg, idx) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        onCopy={handleCopy}
                        isLast={idx === messages.length - 1}
                      />
                    ))}
                    {isSending && <TypingIndicator />}
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="border-t border-border p-4">
                {error && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span className="line-clamp-2">{error}</span>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite sua pergunta..."
                    className="min-h-[40px] max-h-[120px] resize-none text-sm"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    onClick={() => void handleSend()}
                    disabled={!canSend}
                    className="shrink-0"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ─── Training tab ─── */}
          <TabsContent value="training">
            <TrainingTab />
          </TabsContent>

          {/* ─── Integrations tab ─── */}
          <TabsContent value="integrations">
            <IntegrationsTab />
          </TabsContent>

          {/* ─── Security tab ─── */}
          <TabsContent value="security">
            <SecurityDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
