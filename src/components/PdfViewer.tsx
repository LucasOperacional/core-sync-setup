import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";

export type PdfDoc = { name: string; url: string };

export function PdfViewer({ docs }: { docs: PdfDoc[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(docs.length - 1 >= 0 ? docs.length - 1 : 0);
  }, [docs.length]);

  const current = useMemo(() => docs[active] ?? docs[0], [docs, active]);

  if (docs.length === 0) {
    return (
      <div className="panel flex flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <FileText className="size-5" />
        </span>
        <p className="text-sm font-semibold">Visualizador de PDF</p>
        <p className="text-xs text-muted-foreground">
          Importe relatórios acima para visualizá-los automaticamente aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-border p-3">
        {docs.map((d, i) => (
          <button
            key={d.url}
            type="button"
            onClick={() => setActive(i)}
            className={`max-w-[220px] truncate rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              i === active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
            }`}
            title={d.name}
          >
            {d.name}
          </button>
        ))}
      </div>
      {current ? (
        <object data={current.url} type="application/pdf" className="h-[70vh] w-full">
          <iframe src={current.url} title={current.name} className="h-[70vh] w-full" />
        </object>
      ) : null}
    </div>
  );
}
