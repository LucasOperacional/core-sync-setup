export type GeoCaptura = {
  latitude: number | null;
  longitude: number | null;
  precisao: number | null;
  status: "ok" | "negada" | "indisponivel" | "aguardando";
};

export type FotoChecklist = {
  id: string;
  perguntaId: string;
  perguntaTexto: string;
  dataUrl: string;
  capturadaEm: string;
  latitude: number | null;
  longitude: number | null;
  precisao: number | null;
  geoStatus: string;
  observacao: string;
};

export function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export function formatarCoordenadas(geo: Pick<GeoCaptura, "latitude" | "longitude" | "precisao">) {
  if (geo.latitude == null || geo.longitude == null) return "Localização indisponível";
  const precisao = geo.precisao != null ? ` (±${Math.round(geo.precisao)} m)` : "";
  return `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}${precisao}`;
}

function carregarImagem(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = src;
  });
}

function lerArquivo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Reduz a foto e grava data/hora e coordenadas sobre a imagem. */
export async function carimbarFoto(
  file: File,
  geo: GeoCaptura,
  capturadaEm: string,
  linhaExtra?: string,
): Promise<string> {
  const origem = await lerArquivo(file);
  const img = await carregarImagem(origem);

  const largura = Math.min(1280, img.naturalWidth || 1280);
  const escala = largura / (img.naturalWidth || largura);
  const altura = Math.round((img.naturalHeight || largura) * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return origem;

  ctx.drawImage(img, 0, 0, largura, altura);

  const linhas = [
    formatarDataHora(capturadaEm),
    formatarCoordenadas(geo),
    ...(linhaExtra ? [linhaExtra] : []),
  ];

  const fonte = Math.max(14, Math.round(largura * 0.022));
  const espaco = Math.round(fonte * 1.35);
  const alturaFaixa = espaco * linhas.length + fonte;

  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect(0, altura - alturaFaixa, largura, alturaFaixa);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${fonte}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  linhas.forEach((linha, i) => {
    ctx.fillText(
      linha,
      fonte * 0.6,
      altura - alturaFaixa + fonte * 0.5 + i * espaco,
      largura - fonte,
    );
  });

  return canvas.toDataURL("image/jpeg", 0.82);
}
