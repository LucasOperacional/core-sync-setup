import { useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  User,
  ChevronDown,
  ClipboardList,
  ShieldAlert,
  EyeOff,
  Gavel,
  MapPinOff,
  Baby,
  FileCheck,
} from "lucide-react";
import {
  useAtivosBanco,
  useFolhasProtocoladas,
  pendenciasPorEmpresa,
  type FuncionarioAtivoComPosto,
} from "@/lib/ativos-db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ServerFunctionAwareInlineError } from "@/components/server-function-refresh-notice";

/** Postos que indicam que o funcionário está em outra lotação. */
const POSTOS_OUTRAS_LOTACOES = new Set([
  "INSS",
  "AFASTADO POR INSS",
  "AFASTADO INSS",
  "DESAPARECIDO",
  "DESAPARECIDOS",
  "AUDIENCIA",
  "AUDIÊNCIA",
  "MATERNIDADE",
  "LICENÇA MATERNIDADE",
  "LICENCA MATERNIDADE",
]);

/** Retorna true se o posto indica "em outras lotações". */
function isOutraLotacao(posto?: string | null): boolean {
  if (!posto) return false;
  return POSTOS_OUTRAS_LOTACOES.has(posto.trim().toUpperCase());
}

/** Retorna true se o posto (em maiúsculas) representa desaparecido (singular ou plural). */
function isDesaparecido(posto: string): boolean {
  const p = posto.trim().toUpperCase();
  return p === "DESAPARECIDO" || p === "DESAPARECIDOS";
}

/** Retorna true se o posto representa maternidade. */
function isMaternidade(posto: string): boolean {
  const p = posto.trim().toUpperCase();
  return p === "MATERNIDADE" || p === "LICENÇA MATERNIDADE" || p === "LICENCA MATERNIDADE";
}

/** Retorna o ícone adequado para postos afastados/INSS/desaparecido/audiência/maternidade, ou null para ativos normais. */
function IconePosto({ posto }: { posto?: string | null | undefined }) {
  if (!posto) return null;
  const p = posto.trim().toUpperCase();
  if (p === "INSS" || p === "AFASTADO POR INSS" || p === "AFASTADO INSS") {
    return (
      <ShieldAlert
        className="inline-block h-4 w-4 shrink-0 text-destructive"
        aria-label="Afastado por INSS"
      />
    );
  }
  if (isDesaparecido(p)) {
    return (
      <EyeOff
        className="inline-block h-4 w-4 shrink-0 text-orange-500"
        aria-label="Desaparecidos"
      />
    );
  }
  if (p === "AUDIENCIA" || p === "AUDIÊNCIA") {
    return (
      <Gavel className="inline-block h-4 w-4 shrink-0 text-purple-500" aria-label="Audiência" />
    );
  }
  if (isMaternidade(p)) {
    return (
      <Baby className="inline-block h-4 w-4 shrink-0 text-pink-500" aria-label="Maternidade" />
    );
  }
  return null;
}

/** Badge "Em outras lotações" exibido ao lado de funcionários com postos especiais. */
function BadgeOutraLotacao({ posto }: { posto?: string | null | undefined }) {
  if (!isOutraLotacao(posto)) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
      <MapPinOff className="h-3 w-3" />
      Outras lotações
    </span>
  );
}

type CategoriaEspecial = "INSS" | "DESAPARECIDOS" | "MATERNIDADE" | "AUDIÊNCIA";

/** Verifica se um posto pertence a uma categoria especial. */
function matchCategoria(posto: string, categoria: CategoriaEspecial): boolean {
  const p = posto.trim().toUpperCase();
  switch (categoria) {
    case "INSS":
      return p === "INSS" || p === "AFASTADO POR INSS" || p === "AFASTADO INSS";
    case "DESAPARECIDOS":
      return isDesaparecido(p);
    case "MATERNIDADE":
      return isMaternidade(p);
    case "AUDIÊNCIA":
      return p === "AUDIENCIA" || p === "AUDIÊNCIA";
    default:
      return false;
  }
}

/** Conta funcionários por categoria especial de posto (planilha de ativos). */
function contarAtivosPorCategoria(
  pendencias: {
    listaProtocolados: FuncionarioAtivoComPosto[];
    faltantes: FuncionarioAtivoComPosto[];
  }[],
) {
  let inss = 0;
  let desaparecido = 0;
  let maternidade = 0;
  let audiencia = 0;

  for (const p of pendencias) {
    const todos = [...p.listaProtocolados, ...p.faltantes];
    for (const f of todos) {
      if (!f.posto) continue;
      const posto = f.posto.trim().toUpperCase();
      if (posto === "INSS" || posto === "AFASTADO POR INSS" || posto === "AFASTADO INSS") {
        inss++;
      } else if (isDesaparecido(posto)) {
        desaparecido++;
      } else if (isMaternidade(posto)) {
        maternidade++;
      } else if (posto === "AUDIENCIA" || posto === "AUDIÊNCIA") {
        audiencia++;
      }
    }
  }

  return { inss, desaparecido, maternidade, audiencia };
}

/** Tipo de uma folha protocolada retornada pelo hook useFolhasProtocoladas. */
type FolhaProtocolada = {
  id: string;
  protocolo_id: string;
  colaborador: string;
  empresa: string;
  cargo: string;
  matricula: string;
  posto: string;
  ordem: number;
  [key: string]: unknown;
};

/** Conta folhas protocoladas por categoria especial de posto. */
function contarProtocoladosPorCategoria(folhas: FolhaProtocolada[]) {
  let inss = 0;
  let desaparecido = 0;
  let maternidade = 0;
  let audiencia = 0;

  for (const f of folhas) {
    if (!f.posto) continue;
    const posto = f.posto.trim().toUpperCase();
    if (posto === "INSS" || posto === "AFASTADO POR INSS" || posto === "AFASTADO INSS") {
      inss++;
    } else if (isDesaparecido(posto)) {
      desaparecido++;
    } else if (isMaternidade(posto)) {
      maternidade++;
    } else if (posto === "AUDIENCIA" || posto === "AUDIÊNCIA") {
      audiencia++;
    }
  }

  return { inss, desaparecido, maternidade, audiencia };
}

/** Retorna lista de funcionários ativos que pertencem a uma categoria especial. */
function listarAtivosPorCategoria(
  pendencias: {
    listaProtocolados: FuncionarioAtivoComPosto[];
    faltantes: FuncionarioAtivoComPosto[];
    empresa: string;
  }[],
  categoria: CategoriaEspecial,
): (FuncionarioAtivoComPosto & { empresaOrigem: string })[] {
  const resultado: (FuncionarioAtivoComPosto & { empresaOrigem: string })[] = [];

  for (const p of pendencias) {
    const todos = [...p.listaProtocolados, ...p.faltantes];
    for (const f of todos) {
      if (f.posto && matchCategoria(f.posto, categoria)) {
        resultado.push({ ...f, empresaOrigem: p.empresa });
      }
    }
  }

  return resultado.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Retorna lista de folhas protocoladas que pertencem a uma categoria especial. */
function listarFolhasProtocoladasPorCategoria(
  folhas: FolhaProtocolada[],
  categoria: CategoriaEspecial,
): FolhaProtocolada[] {
  return folhas
    .filter((f) => f.posto && matchCategoria(f.posto, categoria))
    .sort((a, b) => a.colaborador.localeCompare(b.colaborador, "pt-BR"));
}

/** Card genérico de resumo (Total de ativos, Já protocolados, etc). */
function Cartao({
  titulo,
  valor,
  destaque,
  icone,
}: {
  titulo: string;
  valor: number;
  destaque?: "ok" | "alerta" | "lotacao";
  icone?: React.ReactNode;
}) {
  const cores =
    destaque === "ok"
      ? "border-primary/30 bg-primary/5"
      : destaque === "alerta"
        ? "border-destructive/30 bg-destructive/5"
        : destaque === "lotacao"
          ? "border-orange-400/30 bg-orange-50 dark:bg-orange-900/10"
          : "border-border bg-card";

  const corValor =
    destaque === "ok"
      ? "text-primary"
      : destaque === "alerta"
        ? "text-destructive"
        : destaque === "lotacao"
          ? "text-orange-600 dark:text-orange-400"
          : "text-foreground";

  return (
    <div className={`rounded-xl border p-4 ${cores}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icone}
        <span>{titulo}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${corValor}`}>{valor.toLocaleString("pt-BR")}</p>
    </div>
  );
}

/** Card clicável para categorias especiais (INSS, Desaparecidos, etc). */
function CartaoCategoriaClicavel({
  titulo,
  valorAtivos,
  valorProtocolados,
  icone,
  corIcone,
  corBg,
  onClick,
}: {
  titulo: string;
  valorAtivos: number;
  valorProtocolados: number;
  icone: React.ReactNode;
  corIcone: string;
  corBg: string;
  onClick: () => void;
}) {
  const faltam = Math.max(valorAtivos - valorProtocolados, 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${corBg}`}
    >
      <div className={`flex items-center gap-2 ${corIcone}`}>
        {icone}
        <span className="text-sm font-semibold text-foreground">{titulo}</span>
      </div>
      <div className="grid w-full grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Ativos</p>
          <p className="text-lg font-bold text-foreground">{valorAtivos}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Protocolados</p>
          <p className="text-lg font-bold text-primary">{valorProtocolados}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Faltam</p>
          <p
            className={`text-lg font-bold ${faltam > 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {faltam}
          </p>
        </div>
      </div>
    </button>
  );
}

/** Aba do painel admin: mostra tudo que já foi protocolado e o que ainda falta. */
export function AbaProtocolacao() {
  const [busca, setBusca] = useState("");
  const [postoSelecionado, setPostoSelecionado] = useState<string>("");
  const [categoriaAberta, setCategoriaAberta] = useState<CategoriaEspecial | null>(null);

  const { data: ativos, isLoading: carregandoAtivos, error: erroAtivos } = useAtivosBanco();
  const { data: folhas, isLoading: carregandoFolhas, error: erroFolhas } = useFolhasProtocoladas();

  const pendencias = useMemo(
    () => pendenciasPorEmpresa(ativos ?? [], folhas ?? []),
    [ativos, folhas],
  );

  /** Postos vindos da planilha de ativos importada (coluna de setor/empresa). */
  const postos = useMemo(
    () =>
      Array.from(new Set(pendencias.map((p) => p.empresa))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [pendencias],
  );

  /** Nomes do posto selecionado, direto da planilha de ativos, com status. */
  const nomesDoPosto = useMemo(() => {
    if (!postoSelecionado) return [];
    const grupo = pendencias.find((p) => p.empresa === postoSelecionado);
    if (!grupo) return [];
    return [
      ...grupo.listaProtocolados.map((a) => ({ ...a, protocolado: true })),
      ...grupo.faltantes.map((a) => ({ ...a, protocolado: false })),
    ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pendencias, postoSelecionado]);

  const resumo = useMemo(() => {
    const total = pendencias.reduce((a, p) => a + p.total, 0);
    const protocolados = pendencias.reduce((a, p) => a + p.protocolados, 0);
    return { total, protocolados, pendentes: total - protocolados };
  }, [pendencias]);

  /** Contagem de funcionários em outras lotações (total). */
  const totalOutrasLotacoes = useMemo(() => {
    let count = 0;
    for (const p of pendencias) {
      for (const f of p.listaProtocolados) {
        if (isOutraLotacao(f.posto)) count++;
      }
      for (const f of p.faltantes) {
        if (isOutraLotacao(f.posto)) count++;
      }
    }
    return count;
  }, [pendencias]);

  /** Contagem detalhada por categoria especial - ativos da planilha. */
  const categoriasAtivos = useMemo(() => contarAtivosPorCategoria(pendencias), [pendencias]);

  /** Contagem detalhada por categoria especial - folhas protocoladas. */
  const categoriasProtocolados = useMemo(
    () => contarProtocoladosPorCategoria((folhas ?? []) as unknown as FolhaProtocolada[]),
    [folhas],
  );

  /** Lista de pessoas ativas na categoria aberta (para o dialog). */
  const pessoasCategoriaAtivos = useMemo(() => {
    if (!categoriaAberta) return [];
    return listarAtivosPorCategoria(pendencias, categoriaAberta);
  }, [pendencias, categoriaAberta]);

  /** Lista de folhas protocoladas na categoria aberta (para o dialog). */
  const folhasCategoriaProtocolados = useMemo(() => {
    if (!categoriaAberta) return [];
    return listarFolhasProtocoladasPorCategoria(
      (folhas ?? []) as unknown as FolhaProtocolada[],
      categoriaAberta,
    );
  }, [folhas, categoriaAberta]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pendencias
      .filter((p) => !postoSelecionado || p.empresa === postoSelecionado)
      .map((p) => ({
        ...p,
        faltantes: q
          ? p.faltantes.filter((f) =>
              `${f.nome} ${f.matricula} ${f.cargo}`.toLowerCase().includes(q),
            )
          : p.faltantes,
        listaProtocolados: q
          ? p.listaProtocolados.filter((f) =>
              `${f.nome} ${f.matricula} ${f.cargo}`.toLowerCase().includes(q),
            )
          : p.listaProtocolados,
      }));
  }, [pendencias, postoSelecionado, busca]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-base font-semibold text-foreground">
          Status de protocolação
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão completa do que já foi protocolado e do que ainda falta ser entregue, cruzando a
          lista de funcionários ativos com os protocolos salvos no banco.
        </p>
      </div>

      {(carregandoAtivos || carregandoFolhas) && (
        <p className="text-sm text-muted-foreground">Carregando dados...</p>
      )}
      {erroAtivos && <ServerFunctionAwareInlineError error={erroAtivos} />}
      {erroFolhas && <ServerFunctionAwareInlineError error={erroFolhas} />}

      {!!ativos?.length && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Cartao
              titulo="Total de ativos"
              valor={resumo.total}
              icone={<User className="h-4 w-4" />}
            />
            <Cartao
              titulo="Já protocolados"
              valor={resumo.protocolados}
              destaque="ok"
              icone={<CheckCircle2 className="h-4 w-4" />}
            />
            <Cartao
              titulo="Faltam protocolar"
              valor={resumo.pendentes}
              destaque="alerta"
              icone={<AlertTriangle className="h-4 w-4" />}
            />
            <Cartao
              titulo="Em outras lotações"
              valor={totalOutrasLotacoes}
              destaque="lotacao"
              icone={<MapPinOff className="h-4 w-4" />}
            />
          </div>

          {/* Cards clicáveis por categoria especial */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Detalhamento por categoria (clique para ver os nomes)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CartaoCategoriaClicavel
                titulo="INSS"
                valorAtivos={categoriasAtivos.inss}
                valorProtocolados={categoriasProtocolados.inss}
                icone={<ShieldAlert className="h-4 w-4" />}
                corIcone="text-red-600 dark:text-red-400"
                corBg="bg-red-100 dark:bg-red-900/20"
                onClick={() => setCategoriaAberta("INSS")}
              />
              <CartaoCategoriaClicavel
                titulo="Desaparecidos"
                valorAtivos={categoriasAtivos.desaparecido}
                valorProtocolados={categoriasProtocolados.desaparecido}
                icone={<EyeOff className="h-4 w-4" />}
                corIcone="text-orange-500 dark:text-orange-400"
                corBg="bg-orange-100 dark:bg-orange-900/20"
                onClick={() => setCategoriaAberta("DESAPARECIDOS")}
              />
              <CartaoCategoriaClicavel
                titulo="Maternidade"
                valorAtivos={categoriasAtivos.maternidade}
                valorProtocolados={categoriasProtocolados.maternidade}
                icone={<Baby className="h-4 w-4" />}
                corIcone="text-pink-500 dark:text-pink-400"
                corBg="bg-pink-100 dark:bg-pink-900/20"
                onClick={() => setCategoriaAberta("MATERNIDADE")}
              />
              <CartaoCategoriaClicavel
                titulo="Audiência"
                valorAtivos={categoriasAtivos.audiencia}
                valorProtocolados={categoriasProtocolados.audiencia}
                icone={<Gavel className="h-4 w-4" />}
                corIcone="text-purple-600 dark:text-purple-400"
                corBg="bg-purple-100 dark:bg-purple-900/20"
                onClick={() => setCategoriaAberta("AUDIÊNCIA")}
              />
            </div>
          </div>

          {/* Dialog com lista de pessoas da categoria clicada */}
          <Dialog
            open={!!categoriaAberta}
            onOpenChange={(open) => {
              if (!open) setCategoriaAberta(null);
            }}
          >
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <IconePosto
                    posto={categoriaAberta === "DESAPARECIDOS" ? "DESAPARECIDO" : categoriaAberta}
                  />
                  {categoriaAberta}
                </DialogTitle>
                <DialogDescription>
                  Funcionários e folhas protocoladas na categoria {categoriaAberta}.
                </DialogDescription>
              </DialogHeader>

              {/* Seção: Folhas protocoladas */}
              <div className="mt-2">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                  <FileCheck className="h-4 w-4" />
                  Folhas protocoladas ({folhasCategoriaProtocolados.length})
                </h4>
                {folhasCategoriaProtocolados.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {folhasCategoriaProtocolados.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-col gap-0.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-foreground">{f.colaborador}</span>
                        {(f.cargo || f.matricula) && (
                          <span className="text-xs text-muted-foreground">
                            {f.cargo}
                            {f.cargo && f.matricula ? " — " : ""}
                            {f.matricula}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/70">
                          Empresa: {f.empresa} {f.posto ? `• Posto: ${f.posto}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma folha protocolada nesta categoria.
                  </p>
                )}
              </div>

              {/* Seção: Funcionários ativos */}
              <div className="mt-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <User className="h-4 w-4" />
                  Funcionários ativos ({pessoasCategoriaAtivos.length})
                </h4>
                {pessoasCategoriaAtivos.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {pessoasCategoriaAtivos.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-col gap-0.5 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-foreground">{f.nome}</span>
                        {(f.cargo || f.matricula) && (
                          <span className="text-xs text-muted-foreground">
                            {f.cargo}
                            {f.cargo && f.matricula ? " — " : ""}
                            {f.matricula}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/70">
                          Empresa: {f.empresaOrigem}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum funcionário ativo nesta categoria.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex flex-wrap gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar colaborador, função ou matrícula"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> INSS / Afastado
              </span>
              <span className="inline-flex items-center gap-1">
                <EyeOff className="h-3.5 w-3.5 text-orange-500" /> Desaparecidos
              </span>
              <span className="inline-flex items-center gap-1">
                <Baby className="h-3.5 w-3.5 text-pink-500" /> Maternidade
              </span>
              <span className="inline-flex items-center gap-1">
                <Gavel className="h-3.5 w-3.5 text-purple-500" /> Audiência
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPinOff className="h-3.5 w-3.5 text-orange-600" /> Em outras lotações
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <ClipboardList className="h-4 w-4 text-primary" />
                Filtrar nomes por posto
              </span>
              <Select value={postoSelecionado} onValueChange={setPostoSelecionado}>
                <SelectTrigger className="w-full sm:w-96">
                  <SelectValue placeholder="Selecione um posto da planilha de ativos" />
                </SelectTrigger>
                <SelectContent>
                  {postos.map((posto) => (
                    <SelectItem key={posto} value={posto}>
                      {posto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {postoSelecionado && (
                <Button variant="ghost" size="sm" onClick={() => setPostoSelecionado("")}>
                  Limpar filtro
                </Button>
              )}
            </div>

            {postoSelecionado && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {nomesDoPosto.length} nome(s) na planilha em "{postoSelecionado}"
                </p>
                {nomesDoPosto.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {nomesDoPosto.map((f) => (
                      <li
                        key={f.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          f.protocolado
                            ? "border-primary/20 bg-primary/5 text-primary"
                            : "border-destructive/20 bg-destructive/5 text-destructive"
                        }`}
                      >
                        {f.protocolado ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                        )}
                        <IconePosto posto={f.posto} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium" title={f.nome}>
                            {f.nome}
                          </span>
                          {(f.cargo || f.matricula) && (
                            <span className="block truncate text-xs opacity-80">
                              {f.cargo}
                              {f.cargo && f.matricula ? " — " : ""}
                              {f.matricula}
                            </span>
                          )}
                          <BadgeOutraLotacao posto={f.posto} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum nome encontrado neste posto.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {visiveis.map((p) => (
              <div key={p.empresa} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {p.empresa}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {p.protocolados} de {p.total} protocolados
                      {p.faltantes.length > 0 ? ` — ${p.faltantes.length} pendente(s)` : ""}
                    </p>
                  </div>
                  {p.faltantes.length === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Tudo protocolado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> {p.faltantes.length} pendente(s)
                    </span>
                  )}
                </div>

                {p.faltantes.length > 0 && (
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-destructive">
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                      Ver pendentes ({p.faltantes.length})
                    </summary>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {p.faltantes.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <IconePosto posto={f.posto} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium" title={f.nome}>
                              {f.nome}
                            </span>
                            {(f.cargo || f.matricula) && (
                              <span className="block truncate text-xs opacity-80">
                                {f.cargo}
                                {f.cargo && f.matricula ? " — " : ""}
                                {f.matricula}
                              </span>
                            )}
                            <BadgeOutraLotacao posto={f.posto} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {p.listaProtocolados.length > 0 && (
                  <details className="group mt-3">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                      Ver protocolados ({p.listaProtocolados.length})
                    </summary>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {p.listaProtocolados.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <IconePosto posto={f.posto} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium" title={f.nome}>
                              {f.nome}
                            </span>
                            {(f.cargo || f.matricula) && (
                              <span className="block truncate text-xs opacity-80">
                                {f.cargo}
                                {f.cargo && f.matricula ? " — " : ""}
                                {f.matricula}
                              </span>
                            )}
                            <BadgeOutraLotacao posto={f.posto} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
