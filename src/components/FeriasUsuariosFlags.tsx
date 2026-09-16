/**
 * Módulo "Usuários" dentro da aba de Férias.
 *
 * Junta os nomes vindos da planilha importada com colaboradores buscados na
 * NEXTI e permite ligar/desligar, por pessoa, o que será feito no envio:
 * lançar as férias, mandar o aviso, exigir leitura/aceite/assinatura e usar
 * período e observação próprios. Tudo fica salvo no banco.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Save, Trash2, UserCog, Users, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { pesquisarColaboradoresNexti, type ColaboradorNexti } from "@/lib/nexti-ativos.functions";
import {
  chaveNome,
  flagPadrao,
  removerFlagFerias,
  salvarFlagsFerias,
  useAtualizarFlagsFerias,
  useFlagsFerias,
  useFuncionariosAtivos,
  type FlagUsuarioFerias,
} from "@/lib/ferias-usuarios";

interface Props {
  /** Nomes lidos da planilha importada (coluna do colaborador). */
  nomesPlanilha: string[];
}

export function FeriasUsuariosFlags({ nomesPlanilha }: Props) {
  const { data: salvos, isLoading } = useFlagsFerias();
  const { data: ativos, isLoading: carregandoAtivos } = useFuncionariosAtivos();
  const atualizarLista = useAtualizarFlagsFerias();

  const [edicoes, setEdicoes] = useState<Record<string, FlagUsuarioFerias>>({});
  const [filtro, setFiltro] = useState("");
  const [termoNexti, setTermoNexti] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ColaboradorNexti[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Lista final: salvos no banco + todos os funcionários ativos + nomes da planilha.
  const linhas = useMemo(() => {
    const mapa = new Map<string, FlagUsuarioFerias>();
    for (const f of salvos ?? []) mapa.set(f.nomeChave, f);
    for (const a of ativos ?? []) {
      const chave = chaveNome(a.nome);
      if (!chave) continue;
      const existente = mapa.get(chave);
      if (existente) {
        // Completa o ajuste salvo com os dados do cadastro de ativos.
        mapa.set(chave, {
          ...existente,
          empresa: existente.empresa || a.empresa,
          matricula: existente.matricula || a.matricula,
        });
        continue;
      }
      mapa.set(
        chave,
        flagPadrao(a.nome, { origem: "nexti", empresa: a.empresa, matricula: a.matricula }),
      );
    }
    for (const nome of nomesPlanilha) {
      const limpo = nome.trim();
      if (!limpo) continue;
      const chave = chaveNome(limpo);
      if (!chave || mapa.has(chave)) continue;
      mapa.set(chave, flagPadrao(limpo, { origem: "planilha" }));
    }
    const lista = [...mapa.values()].map((f) => edicoes[f.nomeChave] ?? f);
    const alvo = chaveNome(filtro);
    const filtrada = alvo
      ? lista.filter((f) => f.nomeChave.includes(alvo) || chaveNome(f.empresa || "").includes(alvo))
      : lista;
    return filtrada.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [salvos, ativos, nomesPlanilha, edicoes, filtro]);

  const pendentes = Object.keys(edicoes).length;

  // Evita manter edições de pessoas que já foram salvas com os mesmos valores.
  useEffect(() => {
    if (!salvos) return;
    setEdicoes((atual) => {
      const copia = { ...atual };
      let mudou = false;
      for (const f of salvos) {
        const edit = copia[f.nomeChave];
        if (edit && JSON.stringify({ ...edit, id: f.id }) === JSON.stringify(f)) {
          delete copia[f.nomeChave];
          mudou = true;
        }
      }
      return mudou ? copia : atual;
    });
  }, [salvos]);

  function alterar(flag: FlagUsuarioFerias, campos: Partial<FlagUsuarioFerias>) {
    setEdicoes((atual) => ({
      ...atual,
      [flag.nomeChave]: { ...flag, ...campos },
    }));
  }

  async function buscarNaNexti() {
    const termo = termoNexti.trim();
    if (termo.length < 3) {
      toast.error("Digite ao menos 3 letras do nome para buscar na NEXTI.");
      return;
    }
    setBuscando(true);
    try {
      const res = await pesquisarColaboradoresNexti({ data: { termo } });
      if (!res.ok) {
        toast.error(res.erro ?? "Não foi possível buscar na NEXTI.");
        setResultados([]);
        return;
      }
      setResultados(res.colaboradores.slice(0, 20));
      if (res.colaboradores.length === 0) toast.info("Nenhum colaborador encontrado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar na NEXTI.");
    } finally {
      setBuscando(false);
    }
  }

  function adicionarDaNexti(c: ColaboradorNexti) {
    const chave = chaveNome(c.colaborador);
    const jaExiste = (salvos ?? []).find((f) => f.nomeChave === chave);
    const base =
      jaExiste ??
      flagPadrao(c.colaborador, {
        origem: "nexti",
      });
    alterar(base, {
      empresa: c.empresa,
      matricula: c.matricula,
      personId: c.personId,
      personExternalId: c.personExternalId,
    });
    toast.success(`${c.colaborador} adicionado à lista. Salve para confirmar.`);
  }

  async function salvarTudo() {
    const alterados = Object.values(edicoes);
    if (alterados.length === 0) {
      toast.info("Nenhuma alteração para salvar.");
      return;
    }
    setSalvando(true);
    try {
      await salvarFlagsFerias(alterados);
      setEdicoes({});
      await atualizarLista();
      toast.success(`${alterados.length} colaborador(es) salvo(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(flag: FlagUsuarioFerias) {
    try {
      if (flag.id) await removerFlagFerias(flag.nomeChave);
      setEdicoes((atual) => {
        const copia = { ...atual };
        delete copia[flag.nomeChave];
        return copia;
      });
      await atualizarLista();
      toast.success(`${flag.nome} removido da lista.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover.");
    }
  }

  function aplicarEmTodos(campos: Partial<FlagUsuarioFerias>) {
    setEdicoes((atual) => {
      const copia = { ...atual };
      for (const f of linhas) copia[f.nomeChave] = { ...f, ...campos };
      return copia;
    });
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">Usuários e flags das férias</h4>
            <p className="text-[11px] text-muted-foreground">
              Todos os funcionários ativos já aparecem aqui. Ajuste, por pessoa, o que será
              enviado — as flags salvas valem para todos os usuários.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {linhas.length} pessoa(s)
          </Badge>
          {pendentes > 0 && (
            <Badge variant="secondary" className="text-[11px]">
              {pendentes} alteração(ões) não salva(s)
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => void salvarTudo()}
            disabled={salvando || pendentes === 0}
          >
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar ajustes
          </Button>
          {pendentes > 0 && (
            <Button size="sm" variant="outline" onClick={() => setEdicoes({})}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Desfazer
            </Button>
          )}
        </div>
      </div>

      {/* Busca na NEXTI */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={termoNexti}
            onChange={(e) => setTermoNexti(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void buscarNaNexti();
            }}
            placeholder="Buscar colaborador na NEXTI pelo nome"
            className="h-9 max-w-xs text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void buscarNaNexti()}
            disabled={buscando}
          >
            {buscando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Buscar
          </Button>
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar a lista abaixo"
            className="h-9 max-w-xs text-sm"
          />
        </div>
        {resultados.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-md border border-border/60 bg-background p-2">
            {resultados.map((c) => (
              <Button
                key={`${c.personId}-${c.matricula}`}
                size="sm"
                variant="secondary"
                className="h-7 text-[11px]"
                onClick={() => adicionarDaNexti(c)}
              >
                {c.colaborador}
                <span className="ml-1 text-muted-foreground">· {c.empresa || "sem empresa"}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Ações em massa */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Aplicar em todos:</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => aplicarEmTodos({ enviarAviso: true })}
        >
          Enviar aviso
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => aplicarEmTodos({ enviarAviso: false })}
        >
          Não enviar aviso
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => aplicarEmTodos({ lancarFerias: true })}
        >
          Lançar férias
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => aplicarEmTodos({ lancarFerias: false })}
        >
          Só aviso
        </Button>
      </div>

      {isLoading || carregandoAtivos ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : linhas.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Users className="h-4 w-4" />
          Nenhum funcionário ativo encontrado. Sincronize os ativos da NEXTI ou importe a planilha.
        </p>
      ) : (
        <ScrollArea className="h-[340px] rounded-md border bg-background">
          <div className="divide-y divide-border/60">
            {linhas.map((f) => (
              <div key={f.nomeChave} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{f.nome}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[f.empresa, f.matricula ? `matrícula ${f.matricula}` : ""]
                        .filter(Boolean)
                        .join(" · ") || "Sem dados da NEXTI ainda"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {f.origem === "planilha"
                        ? "Planilha"
                        : f.origem === "nexti"
                          ? "NEXTI"
                          : "Manual"}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Remover da lista"
                      onClick={() => void remover(f)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <FlagSwitch
                    id={`lancar-${f.nomeChave}`}
                    rotulo="Lançar férias"
                    valor={f.lancarFerias}
                    aoMudar={(v) => alterar(f, { lancarFerias: v })}
                  />
                  <FlagSwitch
                    id={`aviso-${f.nomeChave}`}
                    rotulo="Enviar aviso"
                    valor={f.enviarAviso}
                    aoMudar={(v) => alterar(f, { enviarAviso: v })}
                  />
                  <FlagSwitch
                    id={`msgferias-${f.nomeChave}`}
                    rotulo="Mensagem nas férias"
                    valor={f.enviarFerias}
                    aoMudar={(v) => alterar(f, { enviarFerias: v })}
                  />
                  <FlagSwitch
                    id={`leitura-${f.nomeChave}`}
                    rotulo="Leitura"
                    valor={f.exigirLeitura}
                    aoMudar={(v) => alterar(f, { exigirLeitura: v })}
                  />
                  <FlagSwitch
                    id={`aceite-${f.nomeChave}`}
                    rotulo="Aceite"
                    valor={f.exigirAceite}
                    aoMudar={(v) => alterar(f, { exigirAceite: v })}
                  />
                  <FlagSwitch
                    id={`assinatura-${f.nomeChave}`}
                    rotulo="Assinatura"
                    valor={f.exigirAssinatura}
                    aoMudar={(v) => alterar(f, { exigirAssinatura: v })}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Início (opcional)</span>
                    <Input
                      type="date"
                      value={f.dataInicio}
                      onChange={(e) => alterar(f, { dataInicio: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Fim (opcional)</span>
                    <Input
                      type="date"
                      value={f.dataFim}
                      onChange={(e) => alterar(f, { dataFim: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Dias</span>
                    <Input
                      type="number"
                      min={0}
                      value={f.dias ?? ""}
                      onChange={(e) =>
                        alterar(f, { dias: e.target.value ? Number(e.target.value) : null })
                      }
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Observação própria</span>
                    <Input
                      value={f.observacao}
                      onChange={(e) => alterar(f, { observacao: e.target.value })}
                      placeholder="Usa a mensagem padrão se ficar vazio"
                      className="h-8 text-xs"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function FlagSwitch({
  id,
  rotulo,
  valor,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-[11px] font-medium">
      <Switch id={id} checked={valor} onCheckedChange={aoMudar} />
      {rotulo}
    </label>
  );
}
