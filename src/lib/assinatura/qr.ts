/**
 * Geração de QR Code em JavaScript puro (funciona no servidor do Worker).
 * Devolvemos apenas a matriz de módulos; o desenho é feito pelo pdf-lib
 * ou por SVG no navegador — nada de canvas nativo.
 */

export interface MatrizQr {
  tamanho: number;
  /** true = módulo escuro. */
  modulos: boolean[];
}

export async function gerarMatrizQr(conteudo: string): Promise<MatrizQr> {
  // Importamos o núcleo puro do pacote para evitar dependências de Node.
  const core = (await import("qrcode/lib/core/qrcode.js")) as unknown as {
    create: (
      data: string,
      opts?: { errorCorrectionLevel?: string },
    ) => { modules: { size: number; data: Uint8Array | number[] } };
    default?: {
      create: (
        data: string,
        opts?: { errorCorrectionLevel?: string },
      ) => { modules: { size: number; data: Uint8Array | number[] } };
    };
  };
  const criar = core.create ?? core.default?.create;
  if (!criar) throw new Error("Gerador de QR Code indisponível.");
  const { modules } = criar(conteudo, { errorCorrectionLevel: "M" });
  return {
    tamanho: modules.size,
    modulos: Array.from(modules.data, (valor) => Boolean(valor)),
  };
}

/** SVG simples para exibir o QR Code na interface. */
export function matrizParaSvg(matriz: MatrizQr, tamanhoPx = 160): string {
  const { tamanho, modulos } = matriz;
  let caminho = "";
  for (let linha = 0; linha < tamanho; linha++) {
    for (let coluna = 0; coluna < tamanho; coluna++) {
      if (modulos[linha * tamanho + coluna]) {
        caminho += `M${coluna} ${linha}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanhoPx}" height="${tamanhoPx}" viewBox="0 0 ${tamanho} ${tamanho}" shape-rendering="crispEdges"><rect width="${tamanho}" height="${tamanho}" fill="#ffffff"/><path d="${caminho}" fill="#000000"/></svg>`;
}
