/**
 * Análise de atestados médicos com IA (Gemini multimodal + Google Search grounding).
 *
 * Fluxo:
 *  1. O arquivo (PDF / JPG / PNG) é convertido em imagens PNG de alta qualidade,
 *     com melhoria automática (upscale, contraste, nitidez, remoção de ruído).
 *  2. As imagens (e o texto do PDF, quando existir) são enviadas ao Gemini,
 *     que devolve os campos exatos do atestado em JSON.
 *  3. Uma segunda chamada usa o Google Search (grounding) para conferir médico,
 *     CRM, hospital/clínica e CID na internet, devolvendo o parecer final.
 */

import {
  geminiGenerate,
  extractGeminiText,
  extractGeminiSources,
  loadGeminiConfig,
  GeminiRequestError,
  type GeminiPart,
  type GeminiGroundingSource,
} from "./gemini-enhancer";
import { calcularHashSha256, extrairTexto } from "./atestado-verificador";
import { atestadoIaOperacional } from "./atestado-auditoria.functions";
import { investigarMedicoComManus, type DossieMedico } from "./manus-medico";
import { lerQrCodesDasPaginas } from "./atestado-qrcode";
import { validarQrCodeComManus, type QrCodeValidacao } from "./manus-qrcode";
import {
  gerarParecerAutenticidade,
  type DadosParecerFonte,
  type ParecerAutenticidade,
} from "./atestado-parecer";
import { investigarAtestadoComManus, type ManusAutenticidade } from "./manus-autenticidade";

/* ─────────── Tipos ─────────── */

export interface AtestadoCampoIA {
  valor: string;
  confianca: number; // 0–100
}

export interface AtestadoDadosIA {
  nomePaciente: AtestadoCampoIA;
  cpfPaciente: AtestadoCampoIA;
  nomeMedico: AtestadoCampoIA;
  crm: AtestadoCampoIA;
  ufCrm: AtestadoCampoIA;
  especialidade: AtestadoCampoIA;
  cid: AtestadoCampoIA;
  cidDescricao: AtestadoCampoIA;
  dataConsulta: AtestadoCampoIA;
  horaConsulta: AtestadoCampoIA;
  diasAfastamento: AtestadoCampoIA;
  dataInicioAfastamento: AtestadoCampoIA;
  dataFimAfastamento: AtestadoCampoIA;
  nomeHospital: AtestadoCampoIA;
  enderecoHospital: AtestadoCampoIA;
  cnpjHospital: AtestadoCampoIA;
  telefoneHospital: AtestadoCampoIA;
  codigoValidacao: AtestadoCampoIA;
  qrCodeDetectado: boolean;
  assinaturaDetectada: boolean;
  carimboDetectado: boolean;
  observacoes: string;
}

export interface AtestadoAlertaIA {
  tipo: string;
  descricao: string;
  severidade: "baixa" | "media" | "alta";
}

export interface AtestadoConferenciaIA {
  campo: string;
  valorLido: string;
  valorInformado: string;
  situacao: "confere" | "divergente" | "nao_verificavel";
  comentario: string;
}

export interface AtestadoAuditoriaIA {
  disponivel: boolean;
  mensagem: string;
  conferencia: AtestadoConferenciaIA[];
  divergencias: AtestadoAlertaIA[];
  coerencia: string;
  riscoFraude: number; // 0–100
  confiabilidade: number; // 0–100
  recomendacao: "aceitar" | "revisar" | "recusar" | "indisponivel";
  parecer: string;
}

export interface AtestadoAnaliseIA {
  id: string;
  arquivo: { nome: string; tipo: string; tamanho: number; hash: string };
  dataAnalise: string;
  paginas: string[]; // data URLs das imagens melhoradas
  qualidadeImagem: {
    nota: number; // 0–100
    legivel: boolean;
    comentario: string;
  };
  dados: AtestadoDadosIA;
  alertas: AtestadoAlertaIA[];
  confiancaGlobal: number; // 0–100
  autenticidade: number; // 0–100
  veredito: string;
  textoExtraido: string;
  parecerWeb: string;
  fontesWeb: GeminiGroundingSource[];
  buscasGoogle: Array<{ rotulo: string; url: string }>;
  origemLeitura: "gemini" | "ia-operacional";
  auditoria: AtestadoAuditoriaIA;
  /** Dossiê do médico investigado na internet pela Manus AI. */
  dossieMedico?: DossieMedico;
  /** Leitura e validação online do QR Code do atestado (Manus AI). */
  qrCodeValidacao?: QrCodeValidacao;
  /** Parecer final de autenticidade documental. */
  parecerAutenticidade?: ParecerAutenticidade;
  /** Investigação completa de autenticidade na internet (Manus AI). */
  manusAutenticidade?: ManusAutenticidade;
}

/* ─────────── Melhoria de imagem ─────────── */

function aplicarMelhoria(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const { width, height } = canvas;
  if (!width || !height) return;
  const src = ctx.getImageData(0, 0, width, height);
  const d = src.data;

  // 1) luminância + auto-nível (percentis 2% / 98%)
  const lum = new Float32Array(width * height);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const y = d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114;
    lum[p] = y;
    hist[Math.round(y)] = (hist[Math.round(y)] ?? 0) + 1;
  }
  const total = width * height;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= total * 0.02) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]!;
    if (acc >= total * 0.02) {
      hi = v;
      break;
    }
  }
  const range = Math.max(1, hi - lo);

  const norm = new Float32Array(total);
  for (let p = 0; p < total; p++) {
    let v = ((lum[p]! - lo) / range) * 255;
    // leve ganho de contraste em S
    v = 255 / (1 + Math.exp(-(v - 128) / 48));
    norm[p] = Math.min(255, Math.max(0, v));
  }

  // 2) unsharp mask (nitidez) com blur 3x3
  const blur = new Float32Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += norm[yy * width + xx]!;
          n++;
        }
      }
      blur[y * width + x] = sum / n;
    }
  }

  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const sharp = norm[p]! + 0.9 * (norm[p]! - blur[p]!);
    const v = Math.min(255, Math.max(0, sharp));
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(src, 0, 0);
}

const PAGINA_MIME = "image/jpeg";

/**
 * JPEG de alta qualidade em vez de PNG: mantém a legibilidade do documento e
 * reduz o payload enviado à IA de ~10x (PNG de página inteira travava o envio).
 */
function canvasParaDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL(PAGINA_MIME, 0.92);
}

/** Devolve o controle ao navegador para a interface não congelar. */
function respirar(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Decodifica a foto/imagem enviada. Tenta primeiro `createImageBitmap`, que
 * respeita a orientação EXIF das fotos de celular; se o navegador não souber
 * ler o formato (HEIC/HEIF antigos, por exemplo), avisa de forma clara.
 */
async function decodificarImagem(
  file: File,
): Promise<{ largura: number; altura: number; fonte: CanvasImageSource; liberar: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        largura: bitmap.width,
        altura: bitmap.height,
        fonte: bitmap,
        liberar: () => bitmap.close(),
      };
    } catch {
      /* cai para o <img> abaixo */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error(
            "Não foi possível abrir esta imagem neste navegador. Envie a foto em JPG, PNG ou WEBP (fotos HEIC do iPhone podem precisar ser convertidas).",
          ),
        );
      el.src = url;
    });
    return {
      largura: img.naturalWidth,
      altura: img.naturalHeight,
      fonte: img,
      liberar: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function imagemMelhorada(file: File): Promise<string> {
  const img = await decodificarImagem(file);
  try {
    if (!img.largura || !img.altura) {
      throw new Error("A imagem enviada está vazia ou corrompida.");
    }

    const minDim = Math.min(img.largura, img.altura);
    const maxDim = Math.max(img.largura, img.altura);
    let scale = minDim < 1400 ? 1400 / minDim : 1;
    if (maxDim * scale > 2200) scale = 2200 / maxDim;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.largura * scale);
    canvas.height = Math.round(img.altura * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível neste navegador.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.fonte, 0, 0, canvas.width, canvas.height);
    await respirar();
    aplicarMelhoria(canvas, ctx);
    return canvasParaDataUrl(canvas);
  } finally {
    img.liberar();
  }
}

async function pdfParaImagens(file: File, maxPaginas = 3): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: string[] = [];
  const total = Math.min(doc.numPages, maxPaginas);

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, Math.max(1.4, 1500 / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;
    await respirar();
    aplicarMelhoria(canvas, ctx);
    out.push(canvasParaDataUrl(canvas));
    await respirar();
  }

  return out;
}

/** Gera as imagens melhoradas do documento (PDF, JPG ou PNG). */
export async function gerarPaginasMelhoradas(file: File): Promise<string[]> {
  const nome = file.name.toLowerCase();
  if (file.type === "application/pdf" || nome.endsWith(".pdf")) {
    return pdfParaImagens(file);
  }
  return [await imagemMelhorada(file)];
}

/* ─────────── Prompt / parsing ─────────── */

const CAMPOS_VAZIOS: AtestadoCampoIA = { valor: "Não identificado", confianca: 0 };

const SCHEMA_PROMPT = `Você é um perito em documentos médicos brasileiros (atestados, declarações de comparecimento e laudos).
Analise as imagens do documento com máxima precisão e devolva SOMENTE um JSON válido, sem markdown, no formato:

{
  "qualidadeImagem": { "nota": 0-100, "legivel": true|false, "comentario": "texto curto" },
  "dados": {
    "nomePaciente": {"valor":"","confianca":0},
    "cpfPaciente": {"valor":"","confianca":0},
    "nomeMedico": {"valor":"","confianca":0},
    "crm": {"valor":"","confianca":0},
    "ufCrm": {"valor":"","confianca":0},
    "especialidade": {"valor":"","confianca":0},
    "cid": {"valor":"","confianca":0},
    "cidDescricao": {"valor":"","confianca":0},
    "dataConsulta": {"valor":"","confianca":0},
    "horaConsulta": {"valor":"","confianca":0},
    "diasAfastamento": {"valor":"","confianca":0},
    "dataInicioAfastamento": {"valor":"","confianca":0},
    "dataFimAfastamento": {"valor":"","confianca":0},
    "nomeHospital": {"valor":"","confianca":0},
    "enderecoHospital": {"valor":"","confianca":0},
    "cnpjHospital": {"valor":"","confianca":0},
    "telefoneHospital": {"valor":"","confianca":0},
    "codigoValidacao": {"valor":"","confianca":0},
    "qrCodeDetectado": true|false,
    "assinaturaDetectada": true|false,
    "carimboDetectado": true|false,
    "observacoes": ""
  },
  "alertas": [ { "tipo": "", "descricao": "", "severidade": "baixa|media|alta" } ],
  "confiancaGlobal": 0-100,
  "autenticidade": 0-100,
  "veredito": "texto curto com a conclusão"
}

Regras:
- Transcreva EXATAMENTE o que está escrito; nunca invente dados. Se um campo não existir no documento, use "Não identificado" com confianca 0.
- Datas no formato DD/MM/AAAA. CID no formato oficial (ex.: J06.9) e traga a descrição oficial do código.
- Cite em "alertas" qualquer sinal de adulteração: rasura, fontes diferentes, sobreposição, recorte/colagem, dados inconsistentes, ausência de CRM/assinatura, prazo incoerente.
- "autenticidade" é a probabilidade de o documento ser legítimo.`;

function campo(raw: unknown): AtestadoCampoIA {
  if (raw && typeof raw === "object") {
    const o = raw as { valor?: unknown; confianca?: unknown };
    const valor =
      typeof o.valor === "string" && o.valor.trim() ? o.valor.trim() : "Não identificado";
    const conf = Number(o.confianca);
    return { valor, confianca: Number.isFinite(conf) ? Math.min(100, Math.max(0, conf)) : 0 };
  }
  if (typeof raw === "string" && raw.trim()) return { valor: raw.trim(), confianca: 60 };
  return { ...CAMPOS_VAZIOS };
}

function parseJson(text: string): Record<string, unknown> {
  const limpo = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (inicio === -1 || fim === -1) throw new Error("A IA não devolveu um JSON válido.");
  return JSON.parse(limpo.slice(inicio, fim + 1)) as Record<string, unknown>;
}

function linksGoogle(dados: AtestadoDadosIA): Array<{ rotulo: string; url: string }> {
  const busca = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const out: Array<{ rotulo: string; url: string }> = [];
  const medico = dados.nomeMedico.valor;
  const crm = dados.crm.valor;
  const uf = dados.ufCrm.valor;
  const hospital = dados.nomeHospital.valor;
  const cid = dados.cid.valor;
  const nd = "Não identificado";

  if (medico !== nd || crm !== nd) {
    out.push({
      rotulo: "Médico / CRM",
      url: busca(
        [medico !== nd ? medico : "", crm !== nd ? `CRM ${crm}` : "", uf !== nd ? uf : "", "médico"]
          .filter(Boolean)
          .join(" "),
      ),
    });
  }
  if (crm !== nd) {
    out.push({
      rotulo: "Consulta CRM (Portal Médico)",
      url: busca(`consulta CRM ${crm} ${uf !== nd ? uf : ""} portal.cfm.org.br`),
    });
  }
  if (hospital !== nd) {
    out.push({ rotulo: "Hospital / Clínica", url: busca(`${hospital} endereço telefone CNPJ`) });
  }
  if (cid !== nd) {
    out.push({ rotulo: "CID", url: busca(`CID ${cid} classificação internacional de doenças`) });
  }
  return out;
}

/* ─────────── Conferência pela IA Operacional ─────────── */

function severidade(v: unknown): "baixa" | "media" | "alta" {
  return v === "alta" || v === "media" ? v : "baixa";
}

async function auditarComIaOperacional(args: {
  paginas: string[];
  dados: AtestadoDadosIA;
  alertas: AtestadoAlertaIA[];
  textoExtraido: string;
  parecerWeb: string;
  puloPorSerOrigem: boolean;
}): Promise<AtestadoAuditoriaIA> {
  const vazio: AtestadoAuditoriaIA = {
    disponivel: false,
    mensagem: "",
    conferencia: [],
    divergencias: [],
    coerencia: "",
    riscoFraude: 0,
    confiabilidade: 0,
    recomendacao: "indisponivel",
    parecer: "",
  };

  if (args.puloPorSerOrigem) {
    return {
      ...vazio,
      mensagem:
        "A leitura já foi feita pela IA Operacional (sem chave Gemini configurada), portanto não há segunda conferência independente.",
    };
  }

  try {
    const resumo = JSON.stringify(
      {
        dados: Object.fromEntries(
          Object.entries(args.dados).map(([k, v]) =>
            typeof v === "object" && v !== null ? [k, (v as AtestadoCampoIA).valor] : [k, v],
          ),
        ),
        alertasLeituraAnterior: args.alertas,
      },
      null,
      1,
    ).slice(0, 11000);

    const resp = await atestadoIaOperacional({
      data: {
        modo: "auditar",
        paginas: args.paginas.slice(0, 3),
        dadosPrevios: resumo,
        ...(args.textoExtraido.trim() ? { textoExtraido: args.textoExtraido.slice(0, 12000) } : {}),
        ...(args.parecerWeb.trim() ? { parecerWeb: args.parecerWeb.slice(0, 12000) } : {}),
      },
    });

    const j = parseJson(resp.json);
    const conferencia: AtestadoConferenciaIA[] = Array.isArray(j["conferencia"])
      ? (j["conferencia"] as Array<Record<string, unknown>>).map((c) => ({
          campo: String(c["campo"] ?? ""),
          valorLido: String(c["valorLido"] ?? ""),
          valorInformado: String(c["valorInformado"] ?? ""),
          situacao:
            c["situacao"] === "divergente" || c["situacao"] === "nao_verificavel"
              ? (c["situacao"] as "divergente" | "nao_verificavel")
              : "confere",
          comentario: String(c["comentario"] ?? ""),
        }))
      : [];

    const divergencias: AtestadoAlertaIA[] = Array.isArray(j["divergencias"])
      ? (j["divergencias"] as Array<Record<string, unknown>>).map((d) => ({
          tipo: String(d["campo"] ?? d["tipo"] ?? "Divergência"),
          descricao: String(d["descricao"] ?? ""),
          severidade: severidade(d["severidade"]),
        }))
      : [];

    const rec = j["recomendacao"];
    return {
      disponivel: true,
      mensagem: "",
      conferencia,
      divergencias,
      coerencia: typeof j["coerencia"] === "string" ? (j["coerencia"] as string) : "",
      riscoFraude: Math.min(100, Math.max(0, Number(j["riscoFraude"]) || 0)),
      confiabilidade: Math.min(100, Math.max(0, Number(j["confiabilidade"]) || 0)),
      recomendacao:
        rec === "aceitar" || rec === "recusar" || rec === "revisar"
          ? (rec as "aceitar" | "recusar" | "revisar")
          : "revisar",
      parecer: typeof j["parecer"] === "string" ? (j["parecer"] as string) : "",
    };
  } catch (err) {
    return {
      ...vazio,
      mensagem:
        "A IA Operacional não conseguiu conferir este documento: " +
        (err instanceof Error ? err.message : "erro desconhecido"),
    };
  }
}

/* ─────────── Análise principal ─────────── */

export async function analisarAtestadoComIA(
  file: File,
  onProgress?: (etapa: string) => void,
): Promise<AtestadoAnaliseIA> {
  const config = loadGeminiConfig();
  const temGemini = Boolean(config.apiKey);

  onProgress?.("Calculando assinatura do arquivo...");
  const hash = await calcularHashSha256(file);

  onProgress?.("Melhorando a qualidade da imagem...");
  const paginas = await gerarPaginasMelhoradas(file);
  if (paginas.length === 0) throw new Error("Não foi possível gerar imagens do documento.");

  onProgress?.("Extraindo texto do documento...");
  let textoExtraido = "";
  try {
    textoExtraido = await extrairTexto(file);
  } catch {
    textoExtraido = "";
  }

  onProgress?.(
    temGemini
      ? "Lendo o atestado com a IA (Gemini)..."
      : "Lendo o atestado com a IA Operacional...",
  );
  const hojeBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let bruto: Record<string, unknown>;
  const origemLeitura: "gemini" | "ia-operacional" = temGemini ? "gemini" : "ia-operacional";

  if (temGemini) {
    const parts: GeminiPart[] = [
      {
        text: `${SCHEMA_PROMPT}\n\nA data de HOJE é ${hojeBR} (fuso de São Paulo). Use-a como referência: só aponte alerta de "data futura" se a data do documento for realmente posterior a hoje.`,
      },
    ];
    for (const dataUrl of paginas) {
      const base64 = dataUrl.split(",")[1] ?? "";
      parts.push({ inlineData: { mimeType: PAGINA_MIME, data: base64 } });
    }
    if (textoExtraido.trim()) {
      parts.push({
        text: `Texto embutido extraído do arquivo (use como apoio, a imagem tem prioridade):\n${textoExtraido.slice(0, 6000)}`,
      });
    }

    const extracao = await geminiGenerate({
      apiKey: config.apiKey,
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
      },
      noCache: true,
      logLabel: "Atestado · extração de dados (multimodal)",
    });
    bruto = parseJson(extractGeminiText(extracao.data));
  } else {
    const resp = await atestadoIaOperacional({
      data: {
        modo: "extrair",
        paginas,
        ...(textoExtraido.trim() ? { textoExtraido: textoExtraido.slice(0, 12000) } : {}),
      },
    });
    bruto = parseJson(resp.json);
  }
  const dadosRaw = (bruto["dados"] ?? {}) as Record<string, unknown>;

  const dados: AtestadoDadosIA = {
    nomePaciente: campo(dadosRaw["nomePaciente"]),
    cpfPaciente: campo(dadosRaw["cpfPaciente"]),
    nomeMedico: campo(dadosRaw["nomeMedico"]),
    crm: campo(dadosRaw["crm"]),
    ufCrm: campo(dadosRaw["ufCrm"]),
    especialidade: campo(dadosRaw["especialidade"]),
    cid: campo(dadosRaw["cid"]),
    cidDescricao: campo(dadosRaw["cidDescricao"]),
    dataConsulta: campo(dadosRaw["dataConsulta"]),
    horaConsulta: campo(dadosRaw["horaConsulta"]),
    diasAfastamento: campo(dadosRaw["diasAfastamento"]),
    dataInicioAfastamento: campo(dadosRaw["dataInicioAfastamento"]),
    dataFimAfastamento: campo(dadosRaw["dataFimAfastamento"]),
    nomeHospital: campo(dadosRaw["nomeHospital"]),
    enderecoHospital: campo(dadosRaw["enderecoHospital"]),
    cnpjHospital: campo(dadosRaw["cnpjHospital"]),
    telefoneHospital: campo(dadosRaw["telefoneHospital"]),
    codigoValidacao: campo(dadosRaw["codigoValidacao"]),
    qrCodeDetectado: Boolean(dadosRaw["qrCodeDetectado"]),
    assinaturaDetectada: Boolean(dadosRaw["assinaturaDetectada"]),
    carimboDetectado: Boolean(dadosRaw["carimboDetectado"]),
    observacoes:
      typeof dadosRaw["observacoes"] === "string" ? (dadosRaw["observacoes"] as string) : "",
  };

  const qualidadeRaw = (bruto["qualidadeImagem"] ?? {}) as Record<string, unknown>;
  const qualidadeImagem = {
    nota: Math.min(100, Math.max(0, Number(qualidadeRaw["nota"]) || 0)),
    legivel: qualidadeRaw["legivel"] !== false,
    comentario:
      typeof qualidadeRaw["comentario"] === "string" ? (qualidadeRaw["comentario"] as string) : "",
  };

  const alertas: AtestadoAlertaIA[] = Array.isArray(bruto["alertas"])
    ? (bruto["alertas"] as Array<Record<string, unknown>>).map((a) => ({
        tipo: String(a["tipo"] ?? "Alerta"),
        descricao: String(a["descricao"] ?? ""),
        severidade:
          a["severidade"] === "alta" || a["severidade"] === "media"
            ? (a["severidade"] as "alta" | "media")
            : "baixa",
      }))
    : [];

  /* ── Verificação na web com Google Search ── */
  onProgress?.("Conferindo médico, CRM e hospital no Google...");
  let parecerWeb = "";
  let fontesWeb: GeminiGroundingSource[] = [];
  const nd = "Não identificado";
  const temAlgoParaBuscar =
    dados.nomeMedico.valor !== nd || dados.crm.valor !== nd || dados.nomeHospital.valor !== nd;

  if (temAlgoParaBuscar && temGemini) {
    const perguntas = `Use a busca do Google para verificar as informações abaixo, extraídas de um atestado médico brasileiro, e responda em português do Brasil:

- Médico: ${dados.nomeMedico.valor}
- CRM: ${dados.crm.valor} ${dados.ufCrm.valor !== nd ? `(${dados.ufCrm.valor})` : ""}
- Especialidade informada: ${dados.especialidade.valor}
- Hospital/Clínica: ${dados.nomeHospital.valor}
- Endereço informado: ${dados.enderecoHospital.valor}
- CNPJ informado: ${dados.cnpjHospital.valor}
- CID informado: ${dados.cid.valor} (${dados.cidDescricao.valor})
- Data da consulta: ${dados.dataConsulta.valor}

Responda com estes tópicos, em texto corrido curto e objetivo:
1. Médico/CRM: existe registro compatível? Especialidade confere?
2. Hospital/Clínica: existe, o endereço e o telefone conferem?
3. CID: o código existe e a descrição está correta?
4. Coerência entre CID, dias de afastamento e especialidade.
5. Conclusão: indícios de autenticidade ou de fraude.
Se algo não puder ser confirmado publicamente, diga isso explicitamente.`;

    try {
      const web = await geminiGenerate({
        apiKey: config.apiKey,
        contents: [{ role: "user", parts: [{ text: perguntas }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
        noCache: true,
        logLabel: "Atestado · conferência na web (Google Search)",
      });
      parecerWeb = extractGeminiText(web.data);
      fontesWeb = extractGeminiSources(web.data);
    } catch (err) {
      parecerWeb =
        "Não foi possível concluir a verificação na web: " +
        (err instanceof Error ? err.message : "erro desconhecido") +
        " Use os links de busca abaixo para conferir manualmente.";
    }
  } else if (!temGemini) {
    parecerWeb =
      "Pesquisa na web indisponível: configure a chave da API Gemini no card de integrações para conferir médico, CRM e hospital no Google. A conferência da IA Operacional continua ativa.";
  } else {
    parecerWeb =
      "Nenhum dado suficiente (médico, CRM ou hospital) foi identificado no documento para pesquisa na web.";
  }

  /* ── Conferência independente pela IA Operacional ── */
  onProgress?.("Conferindo os dados com a IA Operacional...");
  const auditoria = await auditarComIaOperacional({
    paginas,
    dados,
    alertas,
    textoExtraido,
    parecerWeb,
    puloPorSerOrigem: !temGemini,
  });

  /* ── Dossiê do médico na internet (Manus AI) ── */
  const dossieMedico = await investigarMedicoComManus(
    {
      nomeMedico: dados.nomeMedico.valor,
      crm: dados.crm.valor,
      ufCrm: dados.ufCrm.valor,
      especialidade: dados.especialidade.valor,
      nomeHospital: dados.nomeHospital.valor,
      enderecoHospital: dados.enderecoHospital.valor,
      cnpjHospital: dados.cnpjHospital.valor,
      cid: dados.cid.valor,
      dataConsulta: dados.dataConsulta.valor,
    },
    onProgress,
  );

  /* ── QR Code: leitura local + validação online na Manus AI ── */
  onProgress?.("Lendo o QR Code do atestado...");
  const qrCodes = await lerQrCodesDasPaginas(paginas);
  if (qrCodes.length) dados.qrCodeDetectado = true;

  const qrCodeValidacao = await validarQrCodeComManus(
    qrCodes,
    {
      nomeMedico: dados.nomeMedico.valor,
      crm: dados.crm.valor,
      ufCrm: dados.ufCrm.valor,
      nomePaciente: dados.nomePaciente.valor,
      cpfPaciente: dados.cpfPaciente.valor,
      dataConsulta: dados.dataConsulta.valor,
      nomeHospital: dados.nomeHospital.valor,
      codigoValidacao: dados.codigoValidacao.valor,
    },
    onProgress,
  );

  if (qrCodeValidacao.disponivel) {
    if (qrCodeValidacao.medicoConfere === "nao") {
      alertas.push({
        tipo: "QR Code · médico divergente",
        descricao: `O QR Code aponta para o médico "${qrCodeValidacao.nomeMedicoNoQrCode || "não informado"}", diferente do nome impresso no atestado ("${dados.nomeMedico.valor}").`,
        severidade: "alta",
      });
    }
    if (qrCodeValidacao.documentoConfirmado === "nao") {
      alertas.push({
        tipo: "QR Code não confirmado",
        descricao:
          `O emissor ${qrCodeValidacao.emissor || "do QR Code"} não confirmou este atestado. ${qrCodeValidacao.conclusao}`.trim(),
        severidade: "alta",
      });
    }
    for (const c of qrCodeValidacao.campos.filter((x) => x.situacao === "divergente")) {
      alertas.push({
        tipo: `QR Code · divergência: ${c.campo}`,
        descricao: `No QR Code: "${c.valorNoQrCode}" · No atestado: "${c.valorNoAtestado}".`,
        severidade: "media",
      });
    }
    for (const a of qrCodeValidacao.alertas) {
      alertas.push({ tipo: "QR Code", descricao: a, severidade: "media" });
    }
  }

  const confiancaGlobal = Math.min(100, Math.max(0, Number(bruto["confiancaGlobal"]) || 0));
  const autenticidade = Math.min(100, Math.max(0, Number(bruto["autenticidade"]) || 0));

  // Registro médico inválido ou sanções encontradas geram alerta de alta severidade.
  if (dossieMedico.disponivel) {
    if (dossieMedico.registroValido === "nao") {
      alertas.push({
        tipo: "Registro do médico",
        descricao: `A Manus AI não confirmou registro ativo para o CRM informado (${dossieMedico.situacaoRegistro || "situação não confirmada"}).`,
        severidade: "alta",
      });
    }
    for (const s of dossieMedico.sancoes) {
      alertas.push({ tipo: "Sanção encontrada", descricao: s, severidade: "alta" });
    }
    for (const d of dossieMedico.detalhes.filter((x) => x.situacao === "divergente")) {
      alertas.push({
        tipo: `Divergência: ${d.campo}`,
        descricao: `${d.valor}${d.fonte ? ` (fonte: ${d.fonte})` : ""}`,
        severidade: "media",
      });
    }
  }

  /* ── Investigação completa de autenticidade na internet (Manus AI) ── */
  const manusAutenticidade = await investigarAtestadoComManus(
    {
      arquivo: { nome: file.name, tipo: file.type || "desconhecido", tamanho: file.size, hash },
      nomePaciente: dados.nomePaciente.valor,
      cpfPaciente: dados.cpfPaciente.valor,
      nomeMedico: dados.nomeMedico.valor,
      crm: dados.crm.valor,
      ufCrm: dados.ufCrm.valor,
      especialidade: dados.especialidade.valor,
      cid: dados.cid.valor,
      cidDescricao: dados.cidDescricao.valor,
      dataConsulta: dados.dataConsulta.valor,
      diasAfastamento: dados.diasAfastamento.valor,
      dataInicioAfastamento: dados.dataInicioAfastamento.valor,
      dataFimAfastamento: dados.dataFimAfastamento.valor,
      nomeHospital: dados.nomeHospital.valor,
      enderecoHospital: dados.enderecoHospital.valor,
      cnpjHospital: dados.cnpjHospital.valor,
      telefoneHospital: dados.telefoneHospital.valor,
      codigoValidacao: dados.codigoValidacao.valor,
      qrCodeDetectado: dados.qrCodeDetectado,
      qrCodeConteudo: qrCodes.map((c) => c.conteudo),
      assinaturaDetectada: dados.assinaturaDetectada,
      carimboDetectado: dados.carimboDetectado,
      observacoes: dados.observacoes,
      textoExtraido,
      alertasDoSistema: alertas.map((a) => `${a.tipo}: ${a.descricao}`),
    },
    onProgress,
  );

  if (manusAutenticidade.disponivel) {
    if (manusAutenticidade.veredito === "falso") {
      alertas.push({
        tipo: "Manus AI · atestado falso",
        descricao:
          manusAutenticidade.parecer ||
          "A investigação em fontes oficiais concluiu que o documento é falso.",
        severidade: "alta",
      });
    } else if (manusAutenticidade.veredito === "suspeito") {
      alertas.push({
        tipo: "Manus AI · atestado suspeito",
        descricao:
          manusAutenticidade.parecer ||
          "A investigação encontrou indícios que exigem apuração antes de aceitar o documento.",
        severidade: "alta",
      });
    }
    if (manusAutenticidade.registroMedicoConfirmado === "nao") {
      alertas.push({
        tipo: "Manus AI · registro do médico",
        descricao: "O registro do médico não foi confirmado em fonte oficial (CFM/CRM).",
        severidade: "alta",
      });
    }
    if (manusAutenticidade.estabelecimentoConfirmado === "nao") {
      alertas.push({
        tipo: "Manus AI · estabelecimento",
        descricao: "O estabelecimento informado no atestado não foi confirmado (CNES/CNPJ).",
        severidade: "media",
      });
    }
    if (manusAutenticidade.documentoConfirmadoPeloEmissor === "nao") {
      alertas.push({
        tipo: "Manus AI · documento não confirmado",
        descricao: "O emissor consultado não confirmou este atestado.",
        severidade: "alta",
      });
    }
    for (const i of manusAutenticidade.indiciosFraude) {
      alertas.push({
        tipo: "Manus AI · indício",
        descricao: `${i.indicio}${i.fonte ? ` (fonte: ${i.fonte})` : ""}`,
        severidade: i.gravidade,
      });
    }
  }

  /* ── Parecer final de autenticidade documental ── */

  const comparacoes: DadosParecerFonte[] = [];
  if (qrCodeValidacao.disponivel) {
    const par: Array<[string, string, string]> = [
      ["Médico", dados.nomeMedico.valor, qrCodeValidacao.nomeMedicoNoQrCode],
      ["CRM", dados.crm.valor, qrCodeValidacao.crmNoQrCode],
      ["Paciente", dados.nomePaciente.valor, qrCodeValidacao.nomePacienteNoQrCode],
      ["Data de atendimento", dados.dataConsulta.valor, qrCodeValidacao.dataNoQrCode],
    ];
    for (const [campo, doc, fonte] of par) {
      comparacoes.push({ campo, valorDocumento: doc, valorFonte: fonte });
    }
    for (const c of qrCodeValidacao.campos) {
      comparacoes.push({
        campo: c.campo,
        valorDocumento: c.valorNoAtestado,
        valorFonte: c.valorNoQrCode,
      });
    }
  }
  for (const c of auditoria.conferencia.filter((x) => x.situacao === "divergente")) {
    comparacoes.push({
      campo: c.campo,
      valorDocumento: c.valorInformado,
      valorFonte: c.valorLido,
    });
  }
  for (const e of manusAutenticidade.evidencias.filter((x) => x.situacao === "divergente")) {
    comparacoes.push({
      campo: e.campo,
      valorDocumento: e.valorNoAtestado,
      valorFonte: e.valorNaFonte,
    });
  }

  const parecerAutenticidade = await gerarParecerAutenticidade(
    {
      arquivo: { nome: file.name, tipo: file.type || "desconhecido", tamanho: file.size, hash },
      paginas,
      dados: {
        nomePaciente: dados.nomePaciente.valor,
        cpfPaciente: dados.cpfPaciente.valor,
        nomeMedico: dados.nomeMedico.valor,
        crm: dados.crm.valor,
        ufCrm: dados.ufCrm.valor,
        especialidade: dados.especialidade.valor,
        cid: dados.cid.valor,
        dataConsulta: dados.dataConsulta.valor,
        diasAfastamento: dados.diasAfastamento.valor,
        dataInicioAfastamento: dados.dataInicioAfastamento.valor,
        dataFimAfastamento: dados.dataFimAfastamento.valor,
        nomeHospital: dados.nomeHospital.valor,
        enderecoHospital: dados.enderecoHospital.valor,
        cnpjHospital: dados.cnpjHospital.valor,
        codigoValidacao: dados.codigoValidacao.valor,
        qrCodeDetectado: dados.qrCodeDetectado,
        assinaturaDetectada: dados.assinaturaDetectada,
        carimboDetectado: dados.carimboDetectado,
      },
      textoExtraido,
      analiseVisual: {
        qualidadeImagem,
        alertas,
        auditoria,
        confiancaGlobal,
        autenticidade,
      },
      qrCode: qrCodeValidacao as unknown as Record<string, unknown>,
      parecerWeb,
      fontesInstitucionais: {
        dossieMedico,
        fontesWeb,
        manusAutenticidade,
      },

      comparacoes,
      qrConfirmado: qrCodeValidacao.disponivel
        ? qrCodeValidacao.documentoConfirmado === "sim" && qrCodeValidacao.medicoConfere !== "nao"
          ? "sim"
          : qrCodeValidacao.documentoConfirmado === "nao"
            ? "nao"
            : "indeterminado"
        : "indeterminado",
      assinaturaDigitalVerificada: null,
    },
    onProgress,
  );

  for (const d of parecerAutenticidade.regrasDeterministicas) {
    alertas.push({
      tipo: `Parecer · ${d.campo}`,
      descricao: `${d.explicacao} Documento: "${d.valorDocumento}" · Fonte: "${d.valorFonte}".`,
      severidade: d.gravidade,
    });
  }

  return {
    id: crypto.randomUUID(),
    arquivo: { nome: file.name, tipo: file.type || "desconhecido", tamanho: file.size, hash },
    dataAnalise: new Date().toISOString(),
    paginas,
    qualidadeImagem,
    dados,
    alertas,
    confiancaGlobal,
    autenticidade,
    veredito: typeof bruto["veredito"] === "string" ? (bruto["veredito"] as string) : "",
    textoExtraido,
    parecerWeb,
    fontesWeb,
    buscasGoogle: linksGoogle(dados),
    origemLeitura,
    auditoria,
    dossieMedico,
    qrCodeValidacao,
    parecerAutenticidade,
    manusAutenticidade,
  };
}
