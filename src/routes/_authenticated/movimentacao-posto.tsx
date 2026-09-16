import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FloatingNav } from "@/components/FloatingNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  registrarMovimentacaoPosto,
  validarCompatibilidadeMovimentacao,
} from "@/lib/movimentacao-posto.functions";
import {
  pesquisarNomeColaboradorNexti,
  pesquisarPostosNexti,
  type NomeColaboradorNexti,
  type PostoNexti,
} from "@/lib/nexti-ativos.functions";

export const Route = createFileRoute("/_authenticated/movimentacao-posto")({
  head: () => ({
    meta: [
      { title: "Movimentação de Posto | Supervisor" },
      {
        name: "description",
        content: "Registro de movimentações de colaboradores entre postos de serviço.",
      },
      { property: "og:title", content: "Movimentação de Posto | Supervisor" },
      {
        property: "og:description",
        content: "Registro de movimentações de colaboradores entre postos de serviço.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MovimentacaoPostoPage,
});

type SearchPickerProps<T> = {
  label: string;
  placeholder: string;
  value: T | null;
  display: (item: T) => string;
  itemKey: (item: T) => string;
  icon: "user" | "map";
  onChange: (item: T | null) => void;
  search: (term: string) => Promise<T[]>;
};

function SearchPicker<T>({
  label,
  placeholder,
  value,
  display,
  itemKey,
  icon,
  onChange,
  search,
}: SearchPickerProps<T>) {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const request = useRef(0);

  const loadItems = useCallback(
    async (query: string) => {
      const id = request.current + 1;
      request.current = id;
      setLoading(true);
      try {
        const result = await search(query.trim());
        if (request.current === id) setItems(result);
      } catch (error) {
        if (request.current === id)
          toast.error(error instanceof Error ? error.message : "Falha na consulta.");
      } finally {
        if (request.current === id) setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    if (value) {
      setItems([]);
      return;
    }
    const timer = setTimeout(
      async () => {
        await loadItems(term);
      },
      term ? 400 : 0,
    );
    return () => clearTimeout(timer);
  }, [loadItems, term, value]);

  const Icon = icon === "user" ? UserCheck : MapPin;
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">{label}</Label>
      {value ? (
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="truncate">{display(value)}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Limpar ${label}`}
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute left-0 top-0 z-10 size-10 text-muted-foreground hover:text-primary"
            aria-label={
              icon === "user" ? "Buscar colaborador na NEXTI" : `Buscar ${label} na NEXTI`
            }
            title={icon === "user" ? "Buscar colaborador na NEXTI" : `Buscar ${label} na NEXTI`}
            onClick={() => {
              setOpen(true);
              void loadItems(term);
            }}
          >
            {icon === "user" ? <UserCheck className="size-4" /> : <Search className="size-4" />}
          </Button>
          <Input
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              if (items.length === 0) void loadItems(term);
            }}
            placeholder={placeholder}
            className="pl-10 pr-9"
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground" />
          ) : null}
          {open && items.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
              {items.map((item) => (
                <li key={itemKey(item)}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal rounded-none px-3 py-2 text-left"
                    onClick={() => {
                      onChange(item);
                      setTerm("");
                      setOpen(false);
                    }}
                  >
                    <Icon className="size-4 shrink-0 text-primary" /> {display(item)}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {open && !loading && items.length === 0 ? (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover px-3 py-3 text-sm text-muted-foreground shadow-lg">
              Nenhum resultado encontrado na NEXTI.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MovimentacaoPostoPage() {
  const searchPeopleFn = useServerFn(pesquisarNomeColaboradorNexti);
  const searchPostsFn = useServerFn(pesquisarPostosNexti);
  const saveFn = useServerFn(registrarMovimentacaoPosto);
  const validateFn = useServerFn(validarCompatibilidadeMovimentacao);
  const [collaborator, setCollaborator] = useState<NomeColaboradorNexti | null>(null);
  const [currentPost, setCurrentPost] = useState<PostoNexti | null>(null);
  const [newPost, setNewPost] = useState<PostoNexti | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [signatureLink, setSignatureLink] = useState<{
    url: string;
    protocolo: string;
    colaborador: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingVacancy, setCheckingVacancy] = useState(false);
  const [vacancyCheck, setVacancyCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const vacancyRequest = useRef(0);

  const searchPeople = useCallback(
    async (term: string) => {
      const result = await searchPeopleFn({ data: { termo: term } });
      if (!result?.ok) throw new Error(result?.erro ?? "Não foi possível consultar a NEXTI.");
      return result.colaboradores ?? [];
    },
    [searchPeopleFn],
  );
  const searchPosts = useCallback(
    async (term: string) => {
      const result = await searchPostsFn({ data: { termo: term } });
      if (!result?.ok) throw new Error(result?.erro ?? "Não foi possível consultar os postos.");
      return result.postos ?? [];
    },
    [searchPostsFn],
  );

  useEffect(() => {
    if (!collaborator || !newPost || !date) {
      setVacancyCheck(null);
      return;
    }
    const requestId = vacancyRequest.current + 1;
    vacancyRequest.current = requestId;
    setCheckingVacancy(true);
    setVacancyCheck(null);
    void validateFn({
      data: {
        personId: String(collaborator.personId),
        novoPostoId: String(newPost.id),
        novoPostoExternalId: newPost.externalId,
        dataMovimentacao: date,
      },
    })
      .then((result) => {
        if (vacancyRequest.current !== requestId) return;
        if (!result) {
          setVacancyCheck({
            ok: false,
            message: "Não foi possível validar a vaga na NEXTI. Tente novamente.",
          });
          return;
        }
        setVacancyCheck({
          ok: result.ok,
          message: result.ok ? result.detalhe : result.erro,
        });
      })
      .catch((error: unknown) => {
        if (vacancyRequest.current !== requestId) return;
        setVacancyCheck({
          ok: false,
          message:
            error instanceof Error ? error.message : "Não foi possível validar a vaga na NEXTI.",
        });
      })
      .finally(() => {
        if (vacancyRequest.current === requestId) setCheckingVacancy(false);
      });
  }, [collaborator, date, newPost, validateFn]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collaborator || !currentPost || !newPost || !date || reason.trim().length < 3) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveFn({
        data: {
          colaborador: collaborator.colaborador,
          personId: String(collaborator.personId),
          personExternalId: collaborator.personExternalId,
          postoAtual: currentPost.nome,
          postoAtualId: String(currentPost.id),
          novoPosto: newPost.nome,
          novoPostoId: String(newPost.id),
          novoPostoExternalId: newPost.externalId,
          dataMovimentacao: date,
          motivo: reason,
          origemUrl: window.location.origin,
        },
      });
      if (!result) {
        toast.error("O servidor não respondeu à solicitação. Tente novamente.");
        return;
      }
      if (!result.ok) {
        toast.error(result.erro);
        return;
      }
      toast.success(
        `Movimentação registrada. Protocolo ${result.protocolo}. Envie o link de assinatura ao colaborador.`,
      );
      setSignatureLink({
        url: result.linkAssinatura,
        protocolo: result.protocolo,
        colaborador: collaborator.colaborador,
      });
      setCollaborator(null);
      setCurrentPost(null);
      setNewPost(null);
      setReason("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar a movimentação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen pb-28">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <Link
            to="/supervisor"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Supervisor
          </Link>
          <h1 className="mt-3 text-3xl font-bold text-foreground">MOVIMENTAÇÃO DE POSTO</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Envie a transferência do colaborador para autorização da Coordenação.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        {signatureLink ? (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LinkIcon />
                </span>
                <div>
                  <CardTitle>Link de assinatura gerado</CardTitle>
                  <CardDescription>
                    Protocolo {signatureLink.protocolo} — envie o link para{" "}
                    {signatureLink.colaborador} assinar.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border bg-background px-3 py-2 text-xs break-all">
                {signatureLink.url}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(signatureLink.url)
                      .then(() => toast.success("Link copiado."))
                      .catch(() => toast.error("Não foi possível copiar o link."));
                  }}
                >
                  <Copy /> Copiar link
                </Button>
                <Button type="button" variant="secondary" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Olá, ${signatureLink.colaborador}. Assine a sua movimentação de posto (protocolo ${signatureLink.protocolo}) neste link: ${signatureLink.url}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle /> Enviar pelo WhatsApp
                  </a>
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSignatureLink(null)}>
                  <X /> Fechar
                </Button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Envie o link ao colaborador (WhatsApp, SMS ou mostre a tela do celular).</li>
                <li>
                  Ele abre o link, confere os dados da transferência e confirma o nome completo.
                </li>
                <li>Assina com o dedo na tela e toca em confirmar assinatura.</li>
                <li>A assinatura fica registrada com data, hora e endereço de acesso.</li>
                <li>Só depois disso a Coordenação consegue autorizar e enviar à NEXTI.</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                O link vale por 7 dias e deixa de funcionar após a assinatura.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <form onSubmit={submit}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ArrowRightLeft />
                </span>
                <div>
                  <CardTitle>Dados da movimentação</CardTitle>
                  <CardDescription>
                    Os colaboradores e postos são consultados diretamente na NEXTI.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <SearchPicker
                label="Colaborador"
                placeholder="Digite o nome do colaborador"
                value={collaborator}
                display={(item) =>
                  item.cargo ? `${item.colaborador} — ${item.cargo}` : item.colaborador
                }
                itemKey={(item) => String(item.personId)}
                icon="user"
                onChange={(item) => {
                  setCollaborator(item);
                  setCurrentPost(
                    item?.workplaceId && item.postoAtual
                      ? { id: item.workplaceId, nome: item.postoAtual, externalId: "" }
                      : null,
                  );
                }}
                search={searchPeople}
              />
              {collaborator ? (
                <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Cargo na NEXTI:</span>{" "}
                    <strong>{collaborator.cargo || "Não informado"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Posto atual na NEXTI:</span>{" "}
                    <strong>{collaborator.postoAtual || "Não informado"}</strong>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-5 md:grid-cols-2">
                <SearchPicker
                  label="Posto atual"
                  placeholder="Pesquise o posto atual"
                  value={currentPost}
                  display={(item) => item.nome}
                  itemKey={(item) => String(item.id)}
                  icon="map"
                  onChange={setCurrentPost}
                  search={searchPosts}
                />
                <SearchPicker
                  label="Novo posto"
                  placeholder="Pesquise o novo posto"
                  value={newPost}
                  display={(item) => item.nome}
                  itemKey={(item) => String(item.id)}
                  icon="map"
                  onChange={setNewPost}
                  search={searchPosts}
                />
              </div>
              {checkingVacancy ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Consultando cargo e vaga na NEXTI...
                </div>
              ) : vacancyCheck ? (
                <div
                  className={`flex items-start gap-2 rounded-md border p-3 text-sm ${vacancyCheck.ok ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
                >
                  {vacancyCheck.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>{vacancyCheck.message}</span>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="movement-date">Data da movimentação</Label>
                <Input
                  id="movement-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-reason">Motivo</Label>
                <Textarea
                  id="movement-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Informe o motivo da movimentação"
                  required
                />
              </div>
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <LinkIcon className="size-4 text-primary" /> Assinatura digital do colaborador
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ao enviar, o sistema gera um link único de assinatura. Procedimento: 1. Copie o
                  link ou envie pelo WhatsApp. 2. O colaborador abre no celular e confere os dados.
                  3. Ele confirma o nome e assina com o dedo. 4. Com a assinatura registrada, a
                  Coordenação autoriza e envia à NEXTI. O link vale por 7 dias e só pode ser usado
                  uma vez.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                A movimentação é enviada para a Coordenação. Apenas coordenadores e administradores
                autorizam o envio à NEXTI.
              </p>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saving || checkingVacancy || vacancyCheck?.ok !== true}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Gerar link de
                  assinatura
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
      <FloatingNav />
    </main>
  );
}
