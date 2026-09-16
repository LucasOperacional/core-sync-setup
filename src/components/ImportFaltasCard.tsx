import { pushSistema } from "@/lib/push-eventos";
import { useRef, useState, useEffect } from "react";
import { FileUp, Loader2, CheckCircle2, AlertTriangle, CalendarX2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ParsedRow } from "@/lib/file-parsers";
import { mesclarLinhas } from "@/lib/tabular-extract";
import { uploadFaltasArquivos } from "@/lib/faltas-db";
import { registrarArquivoImportado } from "@/lib/central-arquivos-db";
import { registrarImportacaoDashboard } from "@/lib/fonte-dashboard";
import {
  validarArquivosDashboard,
  extensaoAceita,
  type RelatorioArquivo,
} from "@/lib/import-validacao";
import { ImportValidacaoRelatorio } from "@/components/ImportValidacaoRelatorio";

const FALTAS_STORAGE_KEY = "nexti-faltas-rows-v1";

const ACCEPTED_MIME =
  "application/pdf,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ImportFaltasCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [relatorios, setRelatorios] = useState<RelatorioArquivo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [currentRows, setCurrentRows] = useState(0);

  // Load current row count from storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FALTAS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCurrentRows(parsed.length);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setLastResult(null);
    setRelatorios([]);

    try {
      const selecionados = Array.from(files);
      if (!selecionados.some((f) => extensaoAceita(f.name))) {
        setLastResult({
          success: false,
          message: "Nenhum arquivo válido selecionado. Aceitos: PDF, CSV, XLSX, XLS, TXT, TSV.",
        });
        setBusy(false);
        return;
      }

      let anteriores: ParsedRow[] = [];
      try {
        const raw = localStorage.getItem(FALTAS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) anteriores = parsed as ParsedRow[];
      } catch {
        /* ignore */
      }

      const validacao = await validarArquivosDashboard(selecionados, "FALTAS", anteriores);
      setRelatorios(validacao.relatorios);

      for (const [i, rel] of validacao.relatorios.entries()) {
        const arquivo = selecionados[i];
        if (!arquivo) continue;
        await registrarArquivoImportado(
          arquivo,
          "FALTAS",
          rel.novas,
          rel.status === "erro" ? rel.mensagens.join(" ") : undefined,
        );
      }

      if (validacao.linhas.length === 0) {
        const motivos = validacao.relatorios
          .filter((r) => r.mensagens.length > 0)
          .map((r) => `${r.arquivo}: ${r.mensagens.join(" ")}`);
        setLastResult({
          success: false,
          message:
            motivos.length > 0
              ? `Nada foi importado — ${motivos.join(" | ")}`
              : "Nada foi importado. Verifique se os arquivos possuem conteúdo tabular com cabeçalho.",
        });
        setBusy(false);
        return;
      }

      const combinadas = mesclarLinhas(anteriores, validacao.linhas);

      try {
        localStorage.setItem(FALTAS_STORAGE_KEY, JSON.stringify(combinadas));
      } catch {
        /* storage full */
      }

      registrarImportacaoDashboard("FALTAS", combinadas.length);
      window.dispatchEvent(new Event("faltas-sync"));

      setCurrentRows(combinadas.length);

      const aprovados = selecionados.filter(
        (f, i) => validacao.relatorios[i] && validacao.relatorios[i]!.status !== "erro",
      );
      try {
        await uploadFaltasArquivos(aprovados);
      } catch {
        /* silent — localStorage is the primary sync */
      }

      const comErro = validacao.arquivosComErro;
      setLastResult({
        success: comErro === 0,
        message: `${validacao.total - comErro} de ${validacao.total} arquivo(s) validado(s) — ${validacao.linhas.length} linha(s) nova(s), ${combinadas.length} no total.${
          comErro > 0 ? ` ${comErro} arquivo(s) com erro (veja a conferência abaixo).` : ""
        }`,
      });
      void pushSistema.importacaoConcluida({
        dashboard: "Faltas",
        arquivos: validacao.total,
        linhas: combinadas.length,
        naoLidos: comErro,
      });
    } catch {
      setLastResult({
        success: false,
        message: "Erro inesperado ao processar os arquivos.",
      });
      void pushSistema.importacaoComErro({ dashboard: "Faltas" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card
      className={`relative overflow-hidden transition-colors ${
        dragOver ? "border-orange-500 bg-orange-500/5" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
            <CalendarX2 className="size-5" />
          </span>
          <div className="flex-1">
            <CardTitle className="text-base">Importar Dados para Faltas</CardTitle>
            <CardDescription className="text-xs">
              Arraste ou selecione arquivos (PDF, CSV, XLSX, XLS) para alimentar o Dashboard de
              Faltas.
            </CardDescription>
          </div>
          {currentRows > 0 && (
            <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-400">
              {currentRows} linha(s)
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME}
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <FileUp className="size-4" />
                Selecionar Arquivos
              </>
            )}
          </button>

          {currentRows > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                localStorage.removeItem(FALTAS_STORAGE_KEY);
                setCurrentRows(0);
                window.dispatchEvent(new Event("faltas-sync"));
                setLastResult({ success: true, message: "Dados importados removidos." });
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Limpar dados importados
            </button>
          )}

          {lastResult && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                lastResult.success
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {lastResult.success ? (
                <CheckCircle2 className="size-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="size-3.5 shrink-0" />
              )}
              {lastResult.message}
            </div>
          )}
        </div>

        {dragOver && (
          <div className="mt-3 flex items-center justify-center rounded-lg border-2 border-dashed border-orange-500/50 bg-orange-500/5 py-6 text-sm font-medium text-orange-400">
            Solte os arquivos aqui para importar
          </div>
        )}
      </CardContent>
    </Card>
  );
}
