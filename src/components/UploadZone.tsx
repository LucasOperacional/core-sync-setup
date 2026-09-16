import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { extractPdfText, parseReportText, type Visit } from "@/lib/report-parser";

export function UploadZone({
  onVisits,
  onFiles,
}: {
  onVisits: (visits: Visit[]) => void;
  onFiles?: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setStatus(null);
    onFiles?.(Array.from(files));
    try {
      const all: Visit[] = [];
      for (const file of Array.from(files)) {
        const text = await extractPdfText(file);
        all.push(...parseReportText(text, file.name));
      }
      if (all.length === 0) {
        setStatus("Nenhuma visita reconhecida nos PDFs enviados.");
      } else {
        onVisits(all);
        setStatus(`${all.length} visita(s) importada(s) com sucesso.`);
      }
    } catch {
      setStatus("Não foi possível ler o PDF. Verifique se o arquivo não é apenas imagem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handleFiles(e.dataTransfer.files);
      }}
      className="panel flex flex-col items-center justify-center gap-2 border-dashed p-6 text-center"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <span className="rounded-xl bg-primary/10 p-3 text-primary">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
      </span>
      <p className="font-display text-sm font-semibold">Arraste relatórios PDF aqui</p>
      <p className="text-xs text-muted-foreground">
        Os indicadores são extraídos automaticamente no seu navegador.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Processando..." : "Selecionar PDFs"}
      </button>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
