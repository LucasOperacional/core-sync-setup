import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";

/**
 * Área para desenhar a assinatura com o dedo (celular) ou com o mouse.
 * Devolve a imagem em PNG com fundo transparente.
 */
export function PadAssinatura({
  rotulo,
  onChange,
  altura = 180,
}: {
  rotulo: string;
  onChange: (dataUrl: string | null) => void;
  altura?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const tracoRef = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const escala = window.devicePixelRatio || 1;
    const largura = canvas.parentElement?.clientWidth ?? 320;
    canvas.width = largura * escala;
    canvas.height = altura * escala;
    canvas.style.width = "100%";
    canvas.style.height = `${altura}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
  }, [altura]);

  function posicao(evento: PointerEvent | React.PointerEvent) {
    const canvas = canvasRef.current!;
    const caixa = canvas.getBoundingClientRect();
    return {
      x: (evento as PointerEvent).clientX - caixa.left,
      y: (evento as PointerEvent).clientY - caixa.top,
    };
  }

  function iniciar(evento: React.PointerEvent) {
    evento.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    desenhando.current = true;
    try {
      evento.currentTarget.setPointerCapture(evento.pointerId);
    } catch {
      /* navegadores antigos */
    }
    const { x, y } = posicao(evento);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(evento: React.PointerEvent) {
    if (!desenhando.current) return;
    evento.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicao(evento);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!tracoRef.current) {
      tracoRef.current = true;
      setTemTraco(true);
    }
  }

  function terminar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    const canvas = canvasRef.current;
    if (canvas && tracoRef.current) onChange(canvas.toDataURL("image/png"));
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tracoRef.current = false;
    setTemTraco(false);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <PenLine className="size-4 text-red-500" />
          {rotulo}
        </p>
        <button
          type="button"
          onClick={limpar}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
        >
          <Eraser className="size-4" /> Limpar
        </button>
      </div>
      <div className="rounded-2xl border-2 border-dashed border-red-500/40 bg-white p-1">
        <canvas
          ref={canvasRef}
          onPointerDown={iniciar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          className="touch-none rounded-xl"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {temTraco ? "Assinatura registrada." : "Assine com o dedo dentro da área branca."}
      </p>
    </div>
  );
}
