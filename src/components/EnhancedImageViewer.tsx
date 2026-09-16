import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sun,
  Contrast,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EnhancedImageViewerProps {
  src: string;
  alt: string;
  className?: string;
}

function applyConvolutionFilter(
  imageData: ImageData,
  kernel: number[],
  kernelSize: number,
): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const half = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx - half));
          const py = Math.min(height - 1, Math.max(0, y + ky - half));
          const idx = (py * width + px) * 4;
          const weight = kernel[ky * kernelSize + kx]!;
          r += data[idx]! * weight;
          g += data[idx + 1]! * weight;
          b += data[idx + 2]! * weight;
        }
      }
      const idx = (y * width + x) * 4;
      output[idx] = Math.min(255, Math.max(0, r));
      output[idx + 1] = Math.min(255, Math.max(0, g));
      output[idx + 2] = Math.min(255, Math.max(0, b));
      output[idx + 3] = data[idx + 3]!;
    }
  }

  return new ImageData(output, width, height);
}

function enhanceImage(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  options: {
    brightness: number;
    contrast: number;
    sharpen: number;
    grayscale: boolean;
  },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  ctx.drawImage(img, 0, 0);

  if (
    options.brightness === 100 &&
    options.contrast === 100 &&
    options.sharpen === 0 &&
    !options.grayscale
  ) {
    return;
  }

  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Brightness and contrast
  const brightnessF = options.brightness / 100;
  const contrastF = (options.contrast - 100) * 2.55;
  const factor = (259 * (contrastF + 255)) / (255 * (259 - contrastF));

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let val = data[i + c]!;
      val = val * brightnessF;
      val = factor * (val - 128) + 128;
      data[i + c] = Math.min(255, Math.max(0, val));
    }
  }

  // Grayscale
  if (options.grayscale) {
    for (let i = 0; i < data.length; i += 4) {
      const avg = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Sharpening
  if (options.sharpen > 0) {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const amount = options.sharpen / 100;
    const center = 1 + 4 * amount;
    const edge = -amount;
    const sharpenKernel = [0, edge, 0, edge, center, edge, 0, edge, 0];
    const sharpened = applyConvolutionFilter(imageData, sharpenKernel, 3);
    ctx.putImageData(sharpened, 0, 0);
  }
}

export function EnhancedImageViewer({ src, alt, className }: EnhancedImageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loaded, setLoaded] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [sharpen, setSharpen] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const applyEnhancement = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;
    enhanceImage(canvas, img, { brightness, contrast, sharpen, grayscale });
  }, [brightness, contrast, sharpen, grayscale, loaded]);

  useEffect(() => {
    if (enhanced) {
      applyEnhancement();
    }
  }, [enhanced, applyEnhancement]);

  const handleImageLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const resetAll = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setSharpen(0);
    setGrayscale(false);
    setEnhanced(false);
  }, []);

  const autoEnhance = useCallback(() => {
    setBrightness(110);
    setContrast(130);
    setSharpen(60);
    setGrayscale(false);
    setEnhanced(true);
  }, []);

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
              >
                <ZoomIn className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Aumentar zoom</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
              >
                <ZoomOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Diminuir zoom</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Girar 90°</TooltipContent>
          </Tooltip>

          <div className="mx-1 h-5 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={enhanced ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  if (!enhanced) {
                    autoEnhance();
                  } else {
                    resetAll();
                  }
                }}
              >
                <Maximize2 className="size-3.5" />
                {enhanced ? "Original" : "Melhorar"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {enhanced
                ? "Voltar para imagem original"
                : "Aplicar melhoria automática (contraste + nitidez)"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showControls ? "secondary" : "ghost"}
                size="icon"
                className="size-8"
                onClick={() => setShowControls((s) => !s)}
              >
                <Sun className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ajustes manuais</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={resetAll}>
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Resetar ajustes</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <span className="ml-auto text-[10px] text-muted-foreground">
          {Math.round(zoom * 100)}%{rotation > 0 ? ` · ${rotation}°` : ""}
          {enhanced ? " · Melhorado" : ""}
        </span>
      </div>

      {/* Manual controls */}
      {showControls && (
        <div className="grid gap-3 rounded-lg border border-border bg-card/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <Sun className="size-3" />
              Brilho: {brightness}%
            </label>
            <Slider
              value={[brightness]}
              min={50}
              max={200}
              step={5}
              onValueChange={([v]) => {
                setBrightness(v!);
                setEnhanced(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <Contrast className="size-3" />
              Contraste: {contrast}%
            </label>
            <Slider
              value={[contrast]}
              min={50}
              max={200}
              step={5}
              onValueChange={([v]) => {
                setContrast(v!);
                setEnhanced(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <Maximize2 className="size-3" />
              Nitidez: {sharpen}%
            </label>
            <Slider
              value={[sharpen]}
              min={0}
              max={200}
              step={10}
              onValueChange={([v]) => {
                setSharpen(v!);
                setEnhanced(true);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant={grayscale ? "secondary" : "outline"}
              size="sm"
              className="h-8 w-full gap-1.5 text-xs"
              onClick={() => {
                setGrayscale((g) => !g);
                setEnhanced(true);
              }}
            >
              <ImageIcon className="size-3.5" />
              {grayscale ? "Colorido" : "Preto e branco"}
            </Button>
          </div>
        </div>
      )}

      {/* Image display */}
      <div
        ref={containerRef}
        className="relative flex items-center justify-center overflow-auto rounded-lg border border-border bg-muted/30 p-4"
        style={{ maxHeight: "60vh" }}
      >
        {/* Hidden img for loading / original source */}
        <img
          ref={(el) => {
            imgRef.current = el;
            if (el && !loaded) {
              el.onload = handleImageLoad;
              if (el.complete && el.naturalWidth > 0) {
                handleImageLoad();
              }
            }
          }}
          src={src}
          alt={alt}
          className="hidden"
          crossOrigin="anonymous"
        />

        {/* Canvas for enhanced view */}
        <canvas
          ref={canvasRef}
          className={`max-w-full transition-transform duration-200 ${enhanced ? "" : "hidden"}`}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
          }}
        />

        {/* Original image */}
        {!enhanced && (
          <img
            src={src}
            alt={alt}
            className="max-h-[50vh] max-w-full rounded-lg object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          />
        )}
      </div>
    </div>
  );
}
