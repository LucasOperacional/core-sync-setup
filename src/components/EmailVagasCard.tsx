import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { obterEmailVagas, salvarEmailVagas } from "@/lib/app-config.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Card do painel admin: define para quais e-mails as vagas aprovadas são enviadas. */
export function EmailVagasCard() {
  const obter = useServerFn(obterEmailVagas);
  const salvar = useServerFn(salvarEmailVagas);
  const [emails, setEmails] = useState<string[]>([""]);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await obter({});
      setEmails(r.emails.length > 0 ? r.emails : [""]);
      setAtualizadoEm(r.atualizadoEm);
    } catch {
      /* silencioso */
    } finally {
      setCarregando(false);
    }
  }, [obter]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alterarEmail(indice: number, valor: string) {
    setEmails((atual) => atual.map((e, i) => (i === indice ? valor : e)));
  }

  function adicionarEmail() {
    setEmails((atual) => [...atual, ""]);
  }

  function removerEmail(indice: number) {
    setEmails((atual) => (atual.length <= 1 ? [""] : atual.filter((_, i) => i !== indice)));
  }

  async function onSalvar() {
    setSalvando(true);
    try {
      await salvar({ data: { emails } });
      toast.success("E-mails de envio das vagas aprovadas atualizados.");
      await carregar();
    } catch (erro) {
      toast.error((erro as Error)?.message || "Não foi possível salvar os e-mails.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mail das vagas aprovadas</CardTitle>
        <CardDescription>
          Toda vaga aprovada é enviada automaticamente, com o PDF, para todos os endereços abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Endereços de destino</Label>
          {emails.map((email, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="recrutamento@empresa.com"
                value={email}
                disabled={carregando}
                onChange={(e) => alterarEmail(indice, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Remover este e-mail"
                disabled={carregando || emails.length <= 1}
                onClick={() => removerEmail(indice)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={carregando}
            onClick={adicionarEmail}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar +1 e-mail
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {atualizadoEm
              ? `Última alteração: ${new Date(atualizadoEm).toLocaleString("pt-BR")}`
              : "Nenhuma alteração registrada."}
          </p>
          <Button onClick={onSalvar} disabled={salvando || carregando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
