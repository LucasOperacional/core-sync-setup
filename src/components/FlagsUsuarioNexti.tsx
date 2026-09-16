/**
 * Ativar/desativar as opções (flags) do colaborador direto na API da NEXTI.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, Search, ToggleLeft } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  FLAGS_NEXTI,
  buscarPessoasFlagsNexti,
  lerFlagsPessoaNexti,
  salvarFlagsPessoaNexti,
  type PessoaFlagsNexti,
} from "@/lib/nexti-flags.functions";

export function FlagsUsuarioNexti() {
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [pessoas, setPessoas] = useState<PessoaFlagsNexti[]>([]);
  const [selecionada, setSelecionada] = useState<PessoaFlagsNexti | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  const buscar = useServerFn(buscarPessoasFlagsNexti);
  const ler = useServerFn(lerFlagsPessoaNexti);
  const salvar = useServerFn(salvarFlagsPessoaNexti);

  async function procurar() {
    if (termo.trim().length < 3) {
      toast.error("Informe ao menos 3 caracteres (nome, CPF ou matrícula).");
      return;
    }
    setBuscando(true);
    setSelecionada(null);
    try {
      const r = await buscar({ data: { termo: termo.trim() } });
      setPessoas(r.pessoas);
      if (r.pessoas.length === 0) toast.info("Nenhum colaborador encontrado na NEXTI.");
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível consultar a NEXTI.");
    } finally {
      setBuscando(false);
    }
  }

  async function abrir(p: PessoaFlagsNexti) {
    setSelecionada(p);
    setFlags(p.flags);
    try {
      const r = await ler({ data: { personId: p.id } });
      if (r.pessoa) {
        setSelecionada(r.pessoa);
        setFlags(r.pessoa.flags);
      }
    } catch {
      /* mantém o que veio da busca */
    }
  }

  async function gravar() {
    if (!selecionada) return;
    setSalvando(true);
    try {
      const r = await salvar({ data: { personId: selecionada.id, flags } });
      if (r.ok) {
        if (r.flags) setFlags(r.flags);
        toast.success("Opções atualizadas na NEXTI.");
      } else {
        toast.error(r.erro ?? "Não foi possível salvar as opções.");
      }
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível salvar as opções.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ToggleLeft className="h-5 w-5" />
          Opções do colaborador na NEXTI
        </CardTitle>
        <CardDescription>
          Busque o colaborador e ative ou desative as permissões direto na NEXTI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void procurar();
            }}
            placeholder="Nome, CPF ou matrícula"
            aria-label="Buscar colaborador na NEXTI"
          />
          <Button onClick={() => void procurar()} disabled={buscando}>
            {buscando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Buscar
          </Button>
        </div>

        {pessoas.length > 0 && (
          <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-2">
            {pessoas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void abrir(p)}
                className={`flex w-full flex-col rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  selecionada?.id === p.id ? "bg-muted" : ""
                }`}
              >
                <span className="font-medium">{p.nome}</span>
                <span className="text-xs text-muted-foreground">
                  Matrícula {p.matricula || "—"} · CPF {p.cpf || "—"} · {p.posto || "sem posto"}
                </span>
              </button>
            ))}
          </div>
        )}

        {selecionada && (
          <div className="space-y-4">
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{selecionada.nome}</Badge>
              {selecionada.escala && <Badge variant="outline">{selecionada.escala}</Badge>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FLAGS_NEXTI.map((f) => (
                <div
                  key={f.chave}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <Label htmlFor={`flag-${f.chave}`} className="text-sm font-normal">
                    {f.rotulo}
                  </Label>
                  <Switch
                    id={`flag-${f.chave}`}
                    checked={flags[f.chave] === true}
                    onCheckedChange={(v) => setFlags((a) => ({ ...a, [f.chave]: v }))}
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => void gravar()} disabled={salvando}>
              {salvando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar opções na NEXTI
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FlagsUsuarioNexti;
