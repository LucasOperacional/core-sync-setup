import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { CampoDocumento, CampoTipo } from "@/lib/assinatura/tipos";
import { ROTULO_CAMPO, TIPOS_ASSINATURA } from "@/lib/assinatura/tipos";

/**
 * Visualiza o PDF importado e permite posicionar os campos com um toque.
 * As posições são guardadas em fração da página, funcionando em qualquer tela.
 */
export function EditorCampos({
  arquivo,
  campos,
  onCampos,
  totalSignatarios,
}: {
  arquivo: File | null;
  campos: CampoDocumento[];
  onCampos: (campos: CampoDocumento[]) => void;
  totalSignatarios: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [tipoAtual, setTipoAtual] = useState<CampoTipo>("nome");
  const [signatarioAtual, setSignatarioAtual] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const bytesRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    bytesRef.current = null;
    setPagina(1);
  }, [arquivo]);

  const renderizar = useCallback(async () => {
    if (!arquivo || !canvasRef.current) return;
    setCarregando(true);
    try {
      if (!bytesRef.current) bytesRef.current = await arquivo.arrayBuffer();
      const pdfjs = await import("pdfjs-dist");
      const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(bytesRef.current.slice(0)) })
        .promise;
      setTotalPaginas(doc.numPages);
      const alvo = Math.min(Math.max(1, pagina), doc.numPages);
      const page = await doc.getPage(alvo);
      const larguraDisponivel = containerRef.current?.clientWidth ?? 600;
      const base = page.getViewport({ scale: 1 });
      const escala = larguraDisponivel / base.width;
      const viewport = page.getViewport({ scale: escala });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx as any, viewport, canvas } as any).promise;
      }
    } catch {
      // PDF protegido ou inválido: o posicionamento manual continua possível.
    } finally {
      setCarregando(false);
    }
  }, [arquivo, pagina]);

  useEffect(() => {
    void renderizar();
  }, [renderizar]);

  function adicionar(evento: React.MouseEvent<HTMLDivElement>) {
    const area = evento.currentTarget.getBoundingClientRect();
    const x = (evento.clientX - area.left) / area.width;
    const y = (evento.clientY - area.top) / area.height;
    const ehAssinatura = TIPOS_ASSINATURA.includes(tipoAtual);
    const campo: CampoDocumento = {
      id: `${tipoAtual}-${Math.random().toString(36).slice(2, 9)}`,
      tipo: tipoAtual,
      rotulo: ROTULO_CAMPO[tipoAtual],
      pagina,
      x: Math.max(0, Math.min(0.98, x)),
      y: Math.max(0, Math.min(0.98, y)),
      w: ehAssinatura ? 0.3 : 0.35,
      h: ehAssinatura ? 0.06 : 0.028,
      obrigatorio: true,
      valor: "",
      signatario: ehAssinatura ? (signatarioAtual ?? 1) : signatarioAtual,
    };
    onCampos([...campos, campo]);
  }

  const daPagina = campos.filter((c) => c.pagina === pagina);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipoAtual}
          onChange={(e) => setTipoAtual(e.target.value as CampoTipo)}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
          aria-label="Tipo de campo"
        >
          {(Object.keys(ROTULO_CAMPO) as CampoTipo[]).map((tipo) => (
            <option key={tipo} value={tipo}>
              {ROTULO_CAMPO[tipo]}
            </option>
          ))}
        </select>
        <select
          value={signatarioAtual === null ? "" : String(signatarioAtual)}
          onChange={(e) => setSignatarioAtual(e.target.value ? Number(e.target.value) : null)}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
          aria-label="Quem preenche"
        >
          <option value="">Preenchido por mim</option>
          {Array.from({ length: Math.max(1, totalSignatarios) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Signatário {n}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Toque no documento para posicionar o campo.</p>
      </div>

      <div ref={containerRef} className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="relative" onClick={adicionar} role="presentation">
          <canvas ref={canvasRef} className="block w-full" />
          {daPagina.map((campo) => (
            <div
              key={campo.id}
              className="absolute flex items-center justify-between gap-1 rounded border-2 border-red-500 bg-red-500/15 px-1 text-[10px] font-semibold text-red-700"
              style={{
                left: `${campo.x * 100}%`,
                top: `${campo.y * 100}%`,
                width: `${campo.w * 100}%`,
                height: `${campo.h * 100}%`,
                minHeight: 16,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="truncate">
                {campo.rotulo}
                {campo.signatario ? ` (S${campo.signatario})` : ""}
              </span>
              <button
                type="button"
                onClick={() => onCampos(campos.filter((c) => c.id !== campo.id))}
                aria-label={`Remover ${campo.rotulo}`}
                className="shrink-0 text-red-700"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {carregando ? (
            <p className="absolute inset-x-0 top-2 text-center text-xs text-muted-foreground">
              Abrindo documento...
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
          disabled={pagina <= 1}
          className="rounded-xl border border-border p-3 disabled:opacity-40"
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          disabled={pagina >= totalPaginas}
          className="rounded-xl border border-border p-3 disabled:opacity-40"
          aria-label="Próxima página"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
