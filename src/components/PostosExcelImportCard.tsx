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

/**
 * Varre a planilha inteira (todas as abas e linhas). Reconhece cabeçalhos em
 * qualquer ponto do arquivo e, quando não houver cabeçalho, procura o nome da
 * empresa em qualquer coluna e usa o texto mais descritivo da linha como posto.
 */
function extrairLinhas(linhas: string[][]): LinhaPlanilhaPosto[] {
  let cPosto = -1;
  let cEmpresa = -1;
  let cVagas = -1;

  const achados = new Map<string, LinhaPlanilhaPosto>();
  /** Quantas vezes o posto aparece na coluna POSTO (1 linha = 1 vaga). */
  const contagem = new Map<string, number>();

  const guardar = (posto: string, empresa: string, vagas: number | null) => {
    const chave = `${chaveNome(posto)}|${chaveNome(empresa)}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    const atual = achados.get(chave);
    if (atual && (atual.vagas ?? 0) >= (vagas ?? 0)) return;
    achados.set(chave, { posto: posto.trim(), empresa: empresa.trim(), vagas });
  };

  for (const bruta of linhas) {
    const linha = bruta ?? [];
    if (linha.every((c) => !(c ?? "").trim())) continue;

    // Cabeçalho pode aparecer várias vezes (uma por aba).
    const hPosto = acharColuna(linha, ["nome do posto", "posto", "local", "unidade", "workplace"]);
    const hEmpresa = acharColuna(linha, ["empresa", "company", "filial", "razao social"]);
    if (hPosto >= 0 && hEmpresa >= 0) {
      cPosto = hPosto;
      cEmpresa = hEmpresa;
      cVagas = acharColuna(linha, [
        "vaga",
        "vagas",
        "vacant",
        "quantidade",
        "qtd",
        "efetivo",
        "posto de trabalho",
      ]);
      continue;
    }

    const numero = (v: string | undefined) => {
      const limpo = (v ?? "").replace(/\D/g, "");
      return limpo === "" ? null : Number(limpo);
    };

    // 1) Colunas identificadas pelo cabeçalho.
    if (cPosto >= 0 && cEmpresa >= 0) {
      const posto = (linha[cPosto] ?? "").trim();
      const empresa = (linha[cEmpresa] ?? "").trim();
      if (posto && empresa && EMPRESAS_CHAVE.has(chaveNome(empresa))) {
        guardar(posto, empresa, cVagas >= 0 ? numero(linha[cVagas]) : null);
        continue;
      }
    }

    // 2) Sem cabeçalho: procura a empresa em qualquer coluna da linha.
    const idxEmpresa = linha.findIndex((c) => EMPRESAS_CHAVE.has(chaveNome(c ?? "")));
    if (idxEmpresa < 0) continue;
    const empresa = (linha[idxEmpresa] ?? "").trim();
    let posto = "";
    for (let j = 0; j < linha.length; j++) {
      if (j === idxEmpresa) continue;
      const valor = (linha[j] ?? "").trim();
      if (valor.length < 3) continue;
      if (!/[A-Za-zÀ-ÿ]/.test(valor)) continue;
      if (EMPRESAS_CHAVE.has(chaveNome(valor))) continue;
      if (valor.length > posto.length) posto = valor;
    }
    if (posto) guardar(posto, empresa, null);
  }

  // Sem coluna de vagas: cada linha da coluna POSTO vale uma vaga.
  return [...achados.entries()].map(([chave, item]) => ({
    ...item,
    vagas: item.vagas ?? contagem.get(chave) ?? null,
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
