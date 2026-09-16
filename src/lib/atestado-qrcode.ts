/**
 * Leitura do QR Code das páginas do atestado (no navegador).
 *
 * As páginas já vêm como data URLs geradas pelo pré-processamento do
 * documento. Aqui tentamos decodificar o QR de várias formas — página
 * inteira, recortes (o QR normalmente fica num canto), escalas diferentes e
 * inversão de cores — porque atestados fotografados costumam ter o código
 * pequeno, torto ou com baixo contraste.
 */

export interface QrCodeLido {
  /** Conteúdo bruto lido do QR. */
  conteudo: string;
  /** Página (1-based) onde o código foi encontrado. */
  pagina: number;
  /** URL contida no conteúdo, quando houver. */
  url: string;
}

function urlDe(conteudo: string): string {
  const m = conteudo.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[.,;)\]]+$/, "") : "";
}

async function carregarImagem(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Não foi possível abrir a página do documento."));
    el.src = dataUrl;
  });
}

type Recorte = { x: number; y: number; w: number; h: number };

/** Página inteira + quadrantes + faixas superior/inferior. */
function recortes(largura: number, altura: number): Recorte[] {
  const w = largura;
  const h = altura;
  const meio = { w: Math.round(w * 0.55), h: Math.round(h * 0.55) };
  return [
    { x: 0, y: 0, w, h },
    { x: 0, y: 0, w: meio.w, h: meio.h },
    { x: w - meio.w, y: 0, w: meio.w, h: meio.h },
    { x: 0, y: h - meio.h, w: meio.w, h: meio.h },
    { x: w - meio.w, y: h - meio.h, w: meio.w, h: meio.h },
    { x: 0, y: Math.round(h * 0.6), w, h: Math.round(h * 0.4) },
    { x: 0, y: 0, w, h: Math.round(h * 0.4) },
  ];
}

/**
 * Lê os QR Codes de todas as páginas do documento. Nunca lança: quando não
 * encontra nada (ou o navegador não consegue processar), devolve lista vazia.
 */
export async function lerQrCodesDasPaginas(paginas: string[]): Promise<QrCodeLido[]> {
  if (!paginas.length || typeof document === "undefined") return [];

  let jsQR: (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: string },
  ) => { data: string } | null;
  try {
    const mod = await import("jsqr");
    jsQR = (mod.default ?? (mod as unknown as typeof mod)) as typeof jsQR;
  } catch {
    return [];
  }

  const encontrados: QrCodeLido[] = [];
  const vistos = new Set<string>();

  for (let p = 0; p < paginas.length; p++) {
    let img: HTMLImageElement;
    try {
      img = await carregarImagem(paginas[p]!);
    } catch {
      continue;
    }
    const lw = img.naturalWidth;
    const lh = img.naturalHeight;
    if (!lw || !lh) continue;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;

    let achouNaPagina = false;
    for (const r of recortes(lw, lh)) {
      if (achouNaPagina) break;
      for (const escala of [1, 2]) {
        const cw = Math.max(1, Math.round(r.w * escala));
        const ch = Math.max(1, Math.round(r.h * escala));
        if (cw * ch > 12_000_000) continue;
        canvas.width = cw;
        canvas.height = ch;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cw, ch);
        ctx.imageSmoothingEnabled = escala > 1;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, cw, ch);

        let dados: ImageData;
        try {
          dados = ctx.getImageData(0, 0, cw, ch);
        } catch {
          continue;
        }

        const res = jsQR(dados.data, cw, ch, { inversionAttempts: "attemptBoth" });
        const conteudo = res?.data?.trim();
        if (conteudo && !vistos.has(conteudo)) {
          vistos.add(conteudo);
          encontrados.push({ conteudo, pagina: p + 1, url: urlDe(conteudo) });
          achouNaPagina = true;
          break;
        }
        // devolve o controle ao navegador entre tentativas pesadas
        await new Promise((r2) => setTimeout(r2, 0));
      }
    }
  }

  return encontrados;
}
