/**
 * IMPORTAR POSTOS VIA EXCEL (planilha como fonte principal).
 *
 * Lê a planilha, procura somente as 5 empresas autorizadas, compara com a
 * API da NEXTI e mostra uma prévia do que está errado antes de corrigir.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseAnyFile } from "@/lib/file-parsers";
import {
  analisarPostosExcel,
  chaveNome,
  corrigirPostosExcel,
  EMPRESAS_PLANILHA,
  type DivergenciaPosto,
  type LinhaPlanilhaPosto,
} from "@/lib/postos-excel.functions";

const EMPRESAS_CHAVE = new Set(EMPRESAS_PLANILHA.map((e) => chaveNome(e)));

function acharColuna(cabecalho: string[], termos: string[]): number {
  return cabecalho.findIndex((c) => {
    const v = chaveNome(c);
    return termos.some((t) => v.includes(chaveNome(t)));
  });
}

/** Reconhece a empresa mesmo quando o nome vem abreviado no título da aba. */
function reconhecerEmpresa(texto: string): string | null {
  const v = chaveNome(texto ?? "");
  if (v.length < 8) return null;
  for (const e of EMPRESAS_PLANILHA) {
    const k = chaveNome(e);
    if (k === v || k.startsWith(v) || v.startsWith(k)) return e;
  }
  return null;
}

const POSTOS_IGNORAR = new Set([
  "TOTAL",
  "TOTAL GERAL",
  "POSTO",
  "SOMA",
  "NOME DO CONTRATO",
  "CONTRATO",
]);

/** Colunas que são só numeração da lista (Nº, item) e nunca contam vagas. */
function ehColunaNumeracao(v: string): boolean {
  return v === "N" || v === "NO" || v === "NUM" || v === "ITEM" || v === "ORDEM";
}


/**
 * Varre a planilha inteira (todas as abas e linhas). Aceita três formatos:
 * 1) colunas Posto + Empresa (+ Vagas);
 * 2) matriz: coluna Posto e uma coluna por função (PORTEIRO I, VIGIA, ...),
 *    somando as funções ou usando "Total de vagas";
 * 3) detalhamento: Posto | Vaga original | Quantidade de vagas (soma por posto).
 * A empresa pode vir só no título da aba (ex.: "TEKTRON ADMINISTRACAO").
 */
function extrairLinhas(linhas: string[][]): LinhaPlanilhaPosto[] {
  let cPosto = -1;
  let cEmpresa = -1;
  let cTotal = -1;
  let cQtd = -1;
  let colunasCargo: number[] = [];
  /** A planilha atual traz informação de vagas? (listas de contratos não trazem) */
  let temVagas = false;
  let empresaGlobal: string | null = null;


  const nomes = new Map<string, LinhaPlanilhaPosto>();
  /** Soma das quantidades por função (formato detalhamento). */
  const somas = new Map<string, number>();
  /** Total informado em linha única (formato matriz). */
  const totais = new Map<string, number>();
  /** Quantas vezes o posto aparece (fallback: 1 linha = 1 vaga). */
  const contagem = new Map<string, number>();
  /** Postos cuja planilha realmente informa vagas. */
  const comVagas = new Set<string>();


  const numero = (v: string | undefined) => {
    const limpo = (v ?? "").replace(/[^\d-]/g, "");
    return limpo === "" || limpo === "-" ? null : Number(limpo);
  };

  for (const bruta of linhas) {
    const linha = bruta ?? [];
    if (linha.every((c) => !(c ?? "").trim())) continue;

    // Título com o nome da empresa em qualquer célula.
    for (const celula of linha) {
      const emp = reconhecerEmpresa(celula ?? "");
      if (emp) empresaGlobal = emp;
    }

    // Cabeçalho pode aparecer várias vezes (uma por aba / bloco).
    const hPosto = linha.findIndex((c) => {
      const v = chaveNome(c ?? "");
      return (
        v === "POSTO" ||
        v === "NOME DO POSTO" ||
        v === "LOCAL" ||
        v === "UNIDADE" ||
        v === "NOME DO CONTRATO" ||
        v === "CONTRATO" ||
        v === "NOME DO POSTO DE SERVICO"
      );
    });
    if (hPosto >= 0) {
      cPosto = hPosto;
      cEmpresa = acharColuna(linha, ["empresa", "company", "filial", "razao social"]);
      cTotal = linha.findIndex((c) => chaveNome(c ?? "").includes("TOTAL DE VAGAS"));
      cQtd = linha.findIndex((c) => {
        const v = chaveNome(c ?? "");
        return v.includes("QUANTIDADE") || v === "QTD" || v === "QTDE";
      });
      colunasCargo = linha
        .map((c, i) => ({ v: chaveNome(c ?? ""), i }))
        .filter(
          ({ v, i }) =>
            v.length > 1 &&
            i !== cPosto &&
            i !== cEmpresa &&
            i !== cTotal &&
            i !== cQtd &&
            !ehColunaNumeracao(v) &&
            !v.includes("VAGA ORIGINAL") &&
            !v.includes("OBSERVAC"),
        )
        .map(({ i }) => i);
      temVagas = cTotal >= 0 || cQtd >= 0 || colunasCargo.length > 0;
      continue;
    }


    if (cPosto < 0) continue;

    const posto = (linha[cPosto] ?? "").trim();
    if (!posto || POSTOS_IGNORAR.has(chaveNome(posto))) continue;

    const empresa =
      (cEmpresa >= 0 ? reconhecerEmpresa(linha[cEmpresa] ?? "") : null) ?? empresaGlobal;
    if (!empresa) continue;

    const chave = `${chaveNome(posto)}|${chaveNome(empresa)}`;
    if (!nomes.has(chave)) nomes.set(chave, { posto, empresa, vagas: null });
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    if (temVagas) comVagas.add(chave);


    if (cQtd >= 0) {
      const q = numero(linha[cQtd]);
      if (q != null) somas.set(chave, (somas.get(chave) ?? 0) + q);
      continue;
    }

    let total = cTotal >= 0 ? numero(linha[cTotal]) : null;
    if (total == null && colunasCargo.length > 0) {
      let soma = 0;
      let achou = false;
      for (const i of colunasCargo) {
        const n = numero(linha[i]);
        if (n != null) {
          soma += n;
          achou = true;
        }
      }
      total = achou ? soma : null;
    }
    if (total != null) totais.set(chave, Math.max(totais.get(chave) ?? 0, total));
  }

  return [...nomes.entries()].map(([chave, item]) => ({
    ...item,
    // Lista só de contratos/postos (sem coluna de vagas): não compara vagas.
    vagas: comVagas.has(chave)
      ? Math.max(somas.get(chave) ?? 0, totais.get(chave) ?? 0) || contagem.get(chave) || null
      : null,
  }));
}


function rotuloTipo(t: DivergenciaPosto["tipo"]): string {
  if (t === "empresa") return "Empresa diferente";
  if (t === "vagas") return "Vagas diferentes";
  if (t === "ambos") return "Empresa e vagas";
  if (t === "semelhante") return "Nome parecido na NEXTI";
  return "Não existe na NEXTI";
}

export function PostosExcelImportCard() {
  const analisar = useServerFn(analisarPostosExcel);
  const corrigir = useServerFn(corrigirPostosExcel);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaPlanilhaPosto[]>([]);
  const [divergencias, setDivergencias] = useState<DivergenciaPosto[] | null>(null);
  const [conferidos, setConferidos] = useState(0);
  const [lendo, setLendo] = useState(false);

  const corrigiveis = useMemo(
    () =>
      (divergencias ?? []).filter(
        (d) => d.nextiId != null && d.tipo !== "nao_encontrado" && d.tipo !== "semelhante",
      ),
    [divergencias],
  );

  const previa = useMutation({
    mutationFn: (lista: LinhaPlanilhaPosto[]) => analisar({ data: { linhas: lista } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível comparar com a NEXTI.");
        return;
      }
      setDivergencias(r.divergencias);
      setConferidos(r.conferidos);
      toast.success(
        r.divergencias.length === 0
          ? "Tudo certo: a NEXTI está igual à planilha."
          : `${r.divergencias.length} posto(s) com diferença em relação à planilha.`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const correcao = useMutation({
    mutationFn: () =>
      corrigir({
        data: {
          itens: corrigiveis.map((d) => ({
            nextiId: d.nextiId as number,
            posto: d.posto,
            ...(d.tipo === "empresa" || d.tipo === "ambos" ? { empresa: d.empresaPlanilha } : {}),
            ...(d.tipo === "vagas" || d.tipo === "ambos" ? { vagas: d.vagasPlanilha } : {}),
          })),
        },
      }),
    onSuccess: (r) => {
      if (r.erro) {
        toast.error(r.erro);
        return;
      }
      toast.success(`${r.corrigidos} posto(s) corrigido(s) na NEXTI.`);
      if (r.falhas.length > 0) {
        toast.error(`${r.falhas.length} posto(s) não puderam ser corrigidos: ${r.falhas[0]?.erro}`);
      }
      setDivergencias(null);
      void queryClient.invalidateQueries({ queryKey: ["postos-vagas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  async function lerArquivo(file: File) {
    setLendo(true);
    setDivergencias(null);
    try {
      const rows = await parseAnyFile(file);
      const extraidas = extrairLinhas(rows);
      setArquivo(file.name);
      setLinhas(extraidas);
      if (extraidas.length === 0) {
        toast.error(
          "Nenhum posto das empresas autorizadas encontrado. Confira as colunas Posto e Empresa.",
        );
        return;
      }
      toast.success(`${extraidas.length} posto(s) lidos da planilha.`);
      previa.mutate(extraidas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4 text-primary" />
          Importar postos por planilha Excel
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lerArquivo(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            className="gap-2"
            disabled={lendo || previa.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {lendo || previa.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Selecionar planilha
          </Button>
          {corrigiveis.length > 0 ? (
            <Button
              className="gap-2"
              disabled={correcao.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Corrigir ${corrigiveis.length} posto(s) na NEXTI usando a planilha como referência?`,
                  )
                )
                  correcao.mutate();
              }}
            >
              {correcao.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Corrigir {corrigiveis.length} na NEXTI
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          A planilha é a referência. Procuramos somente estas empresas:{" "}
          {EMPRESAS_PLANILHA.join(" · ")}. Nada é alterado antes de você conferir a prévia.
        </p>

        {arquivo ? (
          <p className="text-sm">
            <strong>{arquivo}</strong> · {linhas.length} posto(s) na planilha
            {divergencias ? ` · ${conferidos} conferidos na NEXTI` : ""}
          </p>
        ) : null}

        {divergencias && divergencias.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="size-4" /> Nenhuma diferença: a NEXTI já está igual à planilha.
          </p>
        ) : null}

        {divergencias && divergencias.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Posto</th>
                  <th className="px-3 py-2">Diferença</th>
                  <th className="px-3 py-2">Nome parecido na NEXTI</th>
                  <th className="px-3 py-2">Empresa na NEXTI</th>
                  <th className="px-3 py-2">Empresa na planilha</th>
                  <th className="px-3 py-2 text-right">Vagas NEXTI</th>
                  <th className="px-3 py-2 text-right">Vagas planilha</th>
                </tr>
              </thead>
              <tbody>
                {divergencias.map((d) => (
                  <tr key={`${d.nextiId ?? "x"}-${d.posto}`} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{d.posto}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          d.tipo === "nao_encontrado"
                            ? "outline"
                            : d.tipo === "semelhante"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        <AlertTriangle className="mr-1 size-3" />
                        {rotuloTipo(d.tipo)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {d.postoNexti ? `${d.postoNexti} (${d.semelhanca ?? 0}%)` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.empresaNexti ?? "—"}</td>
                    <td className="px-3 py-2">{d.empresaPlanilha}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {d.vagasNexti ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{d.vagasPlanilha ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
