import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { obterEmailVagas, salvarEmailVagas } from "@/lib/app-config.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Card do painel admin: define para qual e-mail as vagas aprovadas são enviadas. */
export function EmailVagasCard() {
  const obter = useServerFn(obterEmailVagas);
  const salvar = useServerFn(salvarEmailVagas);
  const [email, setEmail] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await obter({});
      setEmail(r.email);
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

  async function onSalvar() {
    setSalvando(true);
    try {
      await salvar({ data: { email } });
      toast.success("E-mail de envio das vagas aprovadas atualizado.");
      await carregar();
    } catch (erro) {
      toast.error((erro as Error)?.message || "Não foi possível salvar o e-mail.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mail das vagas aprovadas</CardTitle>
        <CardDescription>
          Toda vaga aprovada é enviada automaticamente, com o PDF, para este endereço.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email-vagas">Endereço de destino</Label>
          <Input
            id="email-vagas"
            type="email"
            placeholder="recrutamento@empresa.com"
            value={email}
            disabled={carregando}
            onChange={(e) => setEmail(e.target.value)}
          />
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
