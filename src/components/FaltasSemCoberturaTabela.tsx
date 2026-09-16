import { useEffect, useRef, useState } from "react";
import { Building2, Save, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { salvarFaltasSemCobertura } from "@/lib/faltas-sem-cobertura.functions";
import { buscarColaboradoresPorNome, type ColaboradorSugestao } from "@/lib/faltas-empresa-lookup";

type Linha = {
  data: string;
  posto: string;
  nome: string;
  cargo: string;
  motivo: string;
  cobertura: string;
  horario: string;
  empresa: string;
};

function novaLinhaVazia(): Linha {
  const hoje = new Date();
  const a = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  const d = String(hoje.getDate()).padStart(2, "0");
  return {
    data: `${a}-${m}-${d}`,
    posto: "",
    nome: "",
    cargo: "",
    motivo: "FALTA",
    cobertura: "",
    horario: "",
    empresa: "",
  };
}

const SEM_EMPRESA = "SEM EMPRESA IDENTIFICADA";

const CABECALHO = [
  "DATA",
  "NOME DO FALTOSO",
  "POSTO/ LOTAÇÃO",
  "CARGO",
  "MOTIVO",
  "COBERTURA",
  "HORÁRIO",
  "EMPRESA",
];

const CLASSE_INPUT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

function preenchida(l: Linha) {
  // Como a data já vem preenchida nativamente, precisamos tirar da verificação
  // para não gerar loops que criam novas linhas infinitamente
  return (
    [l.posto, l.nome, l.cargo, l.cobertura, l.horario].some((v) => v.trim() !== "") ||
    (l.motivo.trim() !== "" && l.motivo.trim().toUpperCase() !== "FALTA")
  );
}

function empresaDaLinha(l: Linha) {
  return l.empresa.trim() || SEM_EMPRESA;
}

/**
 * Tabela de faltas sem cobertura: o supervisor lança e envia os registros.
 */
export function FaltasSemCoberturaTabela() {
  const [linhas, setLinhas] = useState<Linha[]>([novaLinhaVazia()]);
  const [aba, setAba] = useState("todas");
  const [salvando, setSalvando] = useState(false);
  const [sugestoes, setSugestoes] = useState<{ indice: number; itens: ColaboradorSugestao[] }>({
    indice: -1,
    itens: [],
  });
  const buscaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const salvar = useServerFn(salvarFaltasSemCobertura);

  useEffect(
    () => () => {
      if (buscaRef.current) clearTimeout(buscaRef.current);
    },
    [],
  );

  // Linha automática: assim que o supervisor preenche a última linha, uma nova vazia aparece.
  useEffect(() => {
    setLinhas((atual) => {
      const ultima = atual[atual.length - 1];
      if (ultima && preenchida(ultima)) {
        return [...atual, novaLinhaVazia()];
      }
      return atual;
    });
  }, [linhas]);

  const atualizar = (indice: number, chave: keyof Linha, valor: string) =>
    setLinhas((atual) => atual.map((l, i) => (i === indice ? { ...l, [chave]: valor } : l)));

  const aplicarSugestao = (indice: number, s: ColaboradorSugestao) => {
    setLinhas((atual) =>
      atual.map((l, i) =>
        i === indice
          ? {
              ...l,
              nome: s.nome,
              empresa: s.empresa,
              cargo: l.cargo.trim() || s.cargo,
              posto: l.posto.trim() || s.posto,
            }
          : l,
      ),
    );
    setSugestoes({ indice: -1, itens: [] });
  };

  const digitarNome = (indice: number, valor: string) => {
    atualizar(indice, "nome", valor);
    if (buscaRef.current) clearTimeout(buscaRef.current);
    if (valor.trim().length < 3) {
      setSugestoes({ indice: -1, itens: [] });
      atualizar(indice, "empresa", "");
      return;
    }
    buscaRef.current = setTimeout(async () => {
      try {
        const itens = await buscarColaboradoresPorNome(valor);
        const empresas = new Set(itens.map((i) => i.empresa));
        if (itens.length > 0 && empresas.size === 1) {
          aplicarSugestao(indice, itens[0]!);
          return;
        }
        setSugestoes({ indice, itens });
      } catch {
        setSugestoes({ indice: -1, itens: [] });
      }
    }, 400);
  };

  const cheias = linhas.filter(preenchida);
  const empresas = Array.from(new Set(cheias.map(empresaDaLinha))).sort();
  const abaAtiva = aba !== "todas" && !empresas.includes(aba) ? "todas" : aba;

  const visiveis = linhas
    .map((linha, indice) => ({ linha, indice }))
    .filter(({ linha }) =>
      abaAtiva === "todas" ? true : !preenchida(linha) || empresaDaLinha(linha) === abaAtiva,
    );

  const paraExportar =
    abaAtiva === "todas" ? cheias : cheias.filter((l) => empresaDaLinha(l) === abaAtiva);

  const salvarLancamentos = async () => {
    if (cheias.length === 0) return;
    setSalvando(true);
    try {
      await salvar({ data: { linhas: cheias } });
      setLinhas([novaLinhaVazia()]);
      setAba("todas");
      toast.success(`${cheias.length} lançamento(s) enviado(s) para a coordenação.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar os lançamentos.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-t-lg border border-border">
        <table className="w-full min-w-[1250px] border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              {CABECALHO.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap px-4 py-3 text-left font-semibold text-foreground"
                >
                  {c}
                </th>
              ))}
              <th className="w-10 px-2 py-3" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ linha, indice }) => (
              <tr key={indice} className="border-b border-border last:border-0">
                <td className="p-2">
                  <input
                    type="date"
                    aria-label="Data"
                    value={linha.data}
                    onChange={(e) => atualizar(indice, "data", e.target.value)}
                    className={CLASSE_INPUT}
                  />
                </td>
                <td className="relative p-2">
                  <input
                    type="text"
                    aria-label="Nome do faltoso"
                    placeholder="Nome do faltoso"
                    autoComplete="off"
                    value={linha.nome}
                    onChange={(e) => digitarNome(indice, e.target.value)}
                    className={CLASSE_INPUT}
                  />
                  {sugestoes.indice === indice && sugestoes.itens.length > 0 ? (
                    <ul className="absolute left-2 right-2 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                      {sugestoes.itens.map((s) => (
                        <li key={`${s.nome}-${s.empresa}`}>
                          <button
                            type="button"
                            onClick={() => aplicarSugestao(indice, s)}
                            className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"
                          >
                            <span className="block font-semibold">{s.nome}</span>
                            <span className="block text-muted-foreground">{s.empresa}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    aria-label="Posto ou lotação"
                    placeholder="Posto ou lotação"
                    value={linha.posto}
                    onChange={(e) => atualizar(indice, "posto", e.target.value)}
                    className={CLASSE_INPUT}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    aria-label="Cargo"
                    placeholder="Cargo"
                    value={linha.cargo}
                    onChange={(e) => atualizar(indice, "cargo", e.target.value)}
                    className={CLASSE_INPUT}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    aria-label="Motivo da falta"
                    placeholder="Motivo da falta"
                    value={linha.motivo}
                    onChange={(e) => atualizar(indice, "motivo", e.target.value)}
                    className={CLASSE_INPUT}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    aria-label="Cobertura"
                    placeholder="Cobertura"
                    value={linha.cobertura}
                    onChange={(e) => atualizar(indice, "cobertura", e.target.value)}
                    className={CLASSE_INPUT}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="time"
                    aria-label="Horário"
                    value={linha.horario}
                    onChange={(e) => atualizar(indice, "horario", e.target.value)}
                    className={CLASSE_INPUT}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    aria-label="Empresa"
                    placeholder="Empresa"
                    value={linha.empresa}
                    onChange={(e) => atualizar(indice, "empresa", e.target.value)}
                    className={CLASSE_INPUT}
                  />
                </td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    aria-label="Remover linha"
                    onClick={() =>
                      setLinhas((atual) =>
                        atual.length === 1
                          ? [novaLinhaVazia()]
                          : atual.filter((_, i) => i !== indice),
                      )
                    }
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Abas estilo planilha: "Todas" + uma aba para cada empresa com lançamentos */}
      <div
        role="tablist"
        aria-label="Empresas"
        className="flex items-stretch gap-0.5 overflow-x-auto rounded-b-lg border border-t-0 border-border bg-muted/70 px-2 py-1"
      >
        {[
          { valor: "todas", rotulo: `Todas (${cheias.length})` },
          ...empresas.map((e) => ({
            valor: e,
            rotulo: `${e} (${cheias.filter((l) => empresaDaLinha(l) === e).length})`,
          })),
        ].map((t) => (
          <button
            key={t.valor}
            role="tab"
            aria-selected={abaAtiva === t.valor}
            type="button"
            onClick={() => setAba(t.valor)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
              abaAtiva === t.valor
                ? "border-b-primary bg-background text-primary shadow-sm"
                : "border-b-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground"
            }`}
          >
            <Building2 className="size-3.5" /> {t.rotulo}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {paraExportar.length} registro(s) nesta aba
        </span>
        <Button size="sm" disabled={cheias.length === 0 || salvando} onClick={salvarLancamentos}>
          <Save className="size-4" /> {salvando ? "Enviando..." : "Enviar lançamentos"}
        </Button>
      </div>
    </div>
  );
}
