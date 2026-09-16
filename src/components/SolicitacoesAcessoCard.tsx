import { useEffect, useState } from "react";
import { BellRing, Check, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  aprovarSolicitacaoAcesso,
  listarSolicitacoesAcesso,
  recusarSolicitacaoAcesso,
  type SolicitacaoAcesso,
} from "@/lib/solicitacoes-acesso.functions";

const ROTULO_FUNCAO: Record<string, string> = {
  diretor: "Diretor",
  cordenador: "Cordenador",
  mesa_operacional: "Mesa Operacional",
  admin: "Administrador",
  user: "Usuário",
};

type Props = {
  /** Chamado após aprovar/recusar, para recarregar a lista de usuários. */
  onDecidido?: () => void;
};

export function SolicitacoesAcessoCard({ onDecidido }: Props) {
  const [itens, setItens] = useState<SolicitacaoAcesso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);

  async function carregar() {
    try {
      setCarregando(true);
      setItens(await listarSolicitacoesAcesso());
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível carregar as solicitações.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    const id = setInterval(() => void carregar(), 60_000);
    return () => clearInterval(id);
  }, []);

  async function decidir(item: SolicitacaoAcesso, aprovar: boolean) {
    try {
      setProcessando(item.id);
      if (aprovar) {
        await aprovarSolicitacaoAcesso({ data: { id: item.id } });
        toast.success(
          `${item.nome || item.email} aprovado. Agora defina as páginas liberadas em "Permissões".`,
        );
      } else {
        await recusarSolicitacaoAcesso({ data: { id: item.id } });
        toast.success("Solicitação recusada.");
      }
      await carregar();
      onDecidido?.();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível concluir a ação.");
    } finally {
      setProcessando(null);
    }
  }

  const pendentes = itens.filter((i) => i.status === "pendente");
  const decididas = itens.filter((i) => i.status !== "pendente").slice(0, 5);

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <BellRing className="size-5 text-primary" />
          Solicitações de acesso
          {pendentes.length > 0 && (
            <Badge variant="destructive">{pendentes.length} pendente(s)</Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={carregando}>
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {carregando ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : pendentes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            Nenhuma solicitação aguardando aprovação.
          </p>
        ) : (
          pendentes.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{item.nome || item.email}</p>
                <p className="truncate text-sm text-muted-foreground">{item.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">
                    {ROTULO_FUNCAO[item.roleSolicitada] ?? item.roleSolicitada}
                  </Badge>
                  {item.departamento && <Badge variant="outline">{item.departamento}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  onClick={() => void decidir(item, true)}
                  disabled={processando === item.id}
                >
                  {processando === item.id ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 size-4" />
                  )}
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void decidir(item, false)}
                  disabled={processando === item.id}
                >
                  <X className="mr-1.5 size-4" />
                  Recusar
                </Button>
              </div>
            </div>
          ))
        )}

        {decididas.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Últimas decisões
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {decididas.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.nome || item.email}</span>
                  <Badge variant={item.status === "aprovada" ? "secondary" : "outline"}>
                    {item.status === "aprovada" ? "Aprovada" : "Recusada"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
