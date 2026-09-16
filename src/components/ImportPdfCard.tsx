import { useRef, useState } from "react";
import { FileUp, Loader2, CheckCircle2, AlertTriangle, ScanText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  analisarVisitas,
  extractPdfDocument,
  parseReportText,
  type AnaliseArquivo,
  type Visit,
} from "@/lib/report-parser";
import { registrarArquivoImportado } from "@/lib/central-arquivos-db";
import { registrarImportacaoDashboard } from "@/lib/fonte-dashboard";

interface ImportPdfCardProps {
  onVisitsImported: (visits: Visit[]) => void;
  currentCount: number;
}

export function ImportPdfCard({ onVisitsImported, currentCount }: ImportPdfCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
    count: number;
  } | null>(null);
  const [analises, setAnalises] = useState<AnaliseArquivo[]>([]);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setLastResult(null);
    setAnalises([]);
    try {
      const allVisits: Visit[] = [];
      const relatorios: AnaliseArquivo[] = [];
      const pdfs = Array.from(files).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );

      for (const [i, file] of pdfs.entries()) {
        setProgresso(`Lendo ${i + 1}/${pdfs.length}: ${file.name}`);
        try {
          const { texto, paginas, ocr } = await extractPdfDocument(file);
          const revisadas = parseReportText(texto, file.name);

          allVisits.push(...revisadas);
          relatorios.push(analisarVisitas(revisadas, file.name, paginas, ocr));
          await registrarArquivoImportado(file, "CONTROL", revisadas.length);
        } catch (err) {
          console.error(`[ImportPdfCard] Erro ao processar ${file.name}:`, err);
          relatorios.push({
            arquivo: file.name,
            paginas: 0,
            visitas: 0,
            perguntas: 0,
            conformes: 0,
            naoConformes: 0,
            neutros: 0,
            ocr: false,
            cobertura: 0,
            avisos: ["Não foi possível ler o arquivo."],
          });
          await registrarArquivoImportado(
            file,
            "CONTROL",
            0,
            "Não foi possível processar o arquivo.",
          );
        }
      }

      setAnalises(relatorios);

      if (allVisits.length === 0) {
        setLastResult({
          success: false,
          message:
            "Nenhuma visita reconhecida nos PDFs enviados. Verifique se são relatórios de supervisão.",
          count: 0,
        });
      } else {
        const perguntas = relatorios.reduce((acc, r) => acc + r.perguntas, 0);
        registrarImportacaoDashboard("CONTROL", allVisits.length);
        onVisitsImported(allVisits);
        setLastResult({
          success: true,
          message: `${allVisits.length} visita(s) e ${perguntas} pergunta(s) analisadas e sincronizadas com os dashboards.`,
          count: allVisits.length,
        });
      }
    } catch {
      setLastResult({
        success: false,
        message: "Erro ao ler o PDF. Verifique se o arquivo não está corrompido.",
        count: 0,
      });
    } finally {
      setBusy(false);
      setProgresso(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card
      className={`relative overflow-hidden transition-colors ${
        dragOver ? "border-primary bg-primary/5" : ""
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
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileUp className="size-5" />
          </span>
          <div className="flex-1">
            <CardTitle className="text-base">Importar PDF de Relatórios</CardTitle>
            <CardDescription className="text-xs">
              Arraste ou selecione PDFs de supervisão. Cada relatório é lido em tempo real pelo
              próprio sistema antes de alimentar os indicadores.
            </CardDescription>
          </div>
          {currentCount > 0 && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {currentCount} visita(s)
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <FileUp className="size-4" />
                Selecionar PDFs
              </>
            )}
          </button>

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

        {progresso ? <p className="mt-3 text-xs text-muted-foreground">{progresso}</p> : null}

        {analises.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Análise dos documentos importados
            </p>
            {analises.map((a) => (
              <div key={a.arquivo} className="rounded-lg border border-border bg-secondary/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">{a.arquivo}</span>
                  {a.ocr ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-500">
                      <ScanText className="size-3" /> OCR
                    </span>
                  ) : null}
                  <span className="ml-auto text-muted-foreground">{a.paginas} página(s)</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <Metric label="Visitas" value={a.visitas} />
                  <Metric label="Perguntas" value={a.perguntas} />
                  <Metric label="Conformes" value={a.conformes} tone="text-emerald-400" />
                  <Metric label="Não conformes" value={a.naoConformes} tone="text-destructive" />
                  <Metric label="Cobertura" value={`${a.cobertura}%`} />
                </div>
                {a.avisos.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-amber-500">
                    {a.avisos.map((av, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {av}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {dragOver && (
          <div className="mt-3 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 py-6 text-sm font-medium text-primary">
            Solte os PDFs aqui para importar
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-md bg-background/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
