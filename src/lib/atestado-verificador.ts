/**
 * Medical Certificate Verification Engine.
 * Runs OCR, extracts structured data, performs validations, and calculates risk score.
 */
import type {
  DadosExtraidos,
  ValidacaoItem,
  Inconsistencia,
  ResultadoVerificacao,
  ClassificacaoAtestado,
  AcaoHistorico,
} from "./atestado-types";
import { CAMPO_NAO_IDENTIFICADO } from "./atestado-types";

/* ── CID dictionary (reused) ── */
const CID_NAMES: Record<string, string> = {
  A09: "Diarreia e Gastroenterite",
  B34: "Infecção Viral Não Especificada",
  F32: "Episódio Depressivo",
  F41: "Outros Transtornos Ansiosos",
  J06: "Infecções Agudas das Vias Aéreas Superiores",
  J11: "Influenza por Vírus Não Identificado",
  K29: "Gastrite e Duodenite",
  M54: "Dorsalgia",
  R10: "Dor Abdominal e Pélvica",
  R51: "Cefaleia",
  S93: "Luxação/Entorse do Tornozelo e Pé",
  Z00: "Exame Geral e Investigação",
};

function getCidDescricao(cid: string): string {
  if (!cid || cid === CAMPO_NAO_IDENTIFICADO) return "";
  const code = cid.trim().toUpperCase().replace(/[.\s]/g, "");
  return CID_NAMES[code] ?? CID_NAMES[code.slice(0, 3)] ?? "";
}

/* ── SHA-256 hash ── */
export async function calcularHashSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── OCR: Extract text from PDF ── */
async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const lines: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (line.trim()) lines.push(line.trim());
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
  }

  return lines.join("\n");
}

/* ── Image pre-processing for better quality ── */
function preprocessImageForOcr(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Step 1: Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  // Step 2: Increase contrast
  const contrastFactor = 1.5;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const val = data[i + c]!;
      data[i + c] = Math.min(255, Math.max(0, contrastFactor * (val - 128) + 128));
    }
  }

  // Step 3: Adaptive binarization (Otsu-like threshold)
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i]!;
    count++;
  }
  const mean = sum / count;

  // Calculate weighted threshold
  let sumBelow = 0;
  let countBelow = 0;
  let sumAbove = 0;
  let countAbove = 0;
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i]!;
    if (val <= mean) {
      sumBelow += val;
      countBelow++;
    } else {
      sumAbove += val;
      countAbove++;
    }
  }
  const threshold =
    countBelow > 0 && countAbove > 0 ? (sumBelow / countBelow + sumAbove / countAbove) / 2 : mean;

  // Apply threshold with slight softening to preserve detail
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i]!;
    const diff = val - threshold;
    // Soft threshold: preserves some gradient near the boundary
    const newVal = diff > 20 ? 255 : diff < -20 ? 0 : Math.min(255, Math.max(0, 128 + diff * 3));
    data[i] = newVal;
    data[i + 1] = newVal;
    data[i + 2] = newVal;
  }

  ctx.putImageData(imageData, 0, 0);

  // Step 4: Sharpen using convolution
  const sharpened = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = new Uint8ClampedArray(sharpened.data);
  const w = canvas.width;
  const h = canvas.height;
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * w + (x + kx)) * 4 + c;
            val += src[idx]! * kernel[(ky + 1) * 3 + (kx + 1)]!;
          }
        }
        const idx = (y * w + x) * 4 + c;
        sharpened.data[idx] = Math.min(255, Math.max(0, val));
      }
    }
  }

  ctx.putImageData(sharpened, 0, 0);
}

/* ── Generate enhanced image blob from original file ── */
export async function gerarImagemMelhorada(file: File): Promise<{ blob: Blob; url: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const originalUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(originalUrl);
        reject(new Error("Canvas context not available"));
        return;
      }

      // Draw original
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(originalUrl);

      // Apply enhancement pipeline
      // Step 1: Increase resolution by upscaling if small
      if (img.naturalWidth < 1200 || img.naturalHeight < 1200) {
        const scale = Math.max(2, Math.ceil(1600 / Math.min(img.naturalWidth, img.naturalHeight)));
        const upCanvas = document.createElement("canvas");
        upCanvas.width = img.naturalWidth * scale;
        upCanvas.height = img.naturalHeight * scale;
        const upCtx = upCanvas.getContext("2d");
        if (upCtx) {
          upCtx.imageSmoothingEnabled = true;
          upCtx.imageSmoothingQuality = "high";
          upCtx.drawImage(canvas, 0, 0, upCanvas.width, upCanvas.height);

          // Apply contrast and sharpening on upscaled version
          const upData = upCtx.getImageData(0, 0, upCanvas.width, upCanvas.height);
          const d = upData.data;

          // Increase contrast
          const contrastF = 1.3;
          for (let i = 0; i < d.length; i += 4) {
            for (let c = 0; c < 3; c++) {
              d[i + c] = Math.min(255, Math.max(0, contrastF * (d[i + c]! - 128) + 128));
            }
          }
          upCtx.putImageData(upData, 0, 0);

          upCanvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({ blob, url: URL.createObjectURL(blob) });
              } else {
                reject(new Error("Failed to create blob"));
              }
            },
            "image/png",
            1.0,
          );
          return;
        }
      }

      // For larger images, just enhance in place
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      const contrastF = 1.3;
      for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          d[i + c] = Math.min(255, Math.max(0, contrastF * (d[i + c]! - 128) + 128));
        }
      }
      ctx.putImageData(imgData, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, url: URL.createObjectURL(blob) });
          } else {
            reject(new Error("Failed to create blob"));
          }
        },
        "image/png",
        1.0,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(originalUrl);
      reject(new Error("Failed to load image"));
    };
    img.src = originalUrl;
  });
}

/* ── OCR: Extract text from Image via Canvas with preprocessing ── */
async function extrairTextoImagem(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Create a high-quality canvas
      const canvas = document.createElement("canvas");

      // Upscale small images for better text detection
      const minDim = Math.min(img.width, img.height);
      const scale = minDim < 800 ? Math.ceil(1600 / minDim) : minDim < 1200 ? 2 : 1;

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve("");
        return;
      }

      // Use high-quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      // Apply pre-processing pipeline for improved readability
      preprocessImageForOcr(canvas, ctx);

      // Note: Canvas API alone cannot perform OCR text extraction.
      // The pre-processing improves the image quality for:
      // 1. Visual inspection by the administrator
      // 2. Future integration with Tesseract.js or server-side OCR
      // For now, return empty and rely on filename/metadata hints.
      resolve("");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível carregar a imagem."));
    };
    img.src = url;
  });
}

/* ── Extract text based on file type ── */
export async function extrairTexto(file: File): Promise<string> {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return extrairTextoPdf(file);
  }
  if (
    type.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png")
  ) {
    return extrairTextoImagem(file);
  }
  return "";
}

/* ── Regex-based data extraction ── */
function extrair(texto: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = texto.match(p);
    if (m && m[1]?.trim()) return m[1].trim();
  }
  return CAMPO_NAO_IDENTIFICADO;
}

function extrairDados(texto: string): DadosExtraidos {
  const t = texto;

  const nomePaciente = extrair(t, [
    /(?:paciente|nome do paciente|nome)[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,})/im,
    /(?:atesto que|atesto[,.]?\s*(?:para|que))[^,]*?(?:o(?:\(a\))?\s+(?:sr\.?|sra\.?)?\s+)([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,})/im,
  ]);

  const cpf = extrair(t, [
    /(?:cpf)[:\s]*(\d{3}[.\s]?\d{3}[.\s]?\d{3}[\-\s]?\d{2})/im,
    /(\d{3}\.\d{3}\.\d{3}-\d{2})/m,
  ]);

  const nomeMedico = extrair(t, [
    /(?:m[eé]dico|dr\.?|dra\.?)[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,})/im,
    /(?:assinatura|responsavel|responsável)[:\s]+(?:dr\.?|dra\.?)?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,})/im,
  ]);

  const crmMatch =
    t.match(/(?:CRM)[:\s\-/]*([A-Z]{2})?[\s\-/]*(\d{4,7})/im) ??
    t.match(/(\d{4,7})[\s\-/]*(?:CRM)[\s\-/]*([A-Z]{2})?/im);

  let crm = CAMPO_NAO_IDENTIFICADO;
  let ufCrm = CAMPO_NAO_IDENTIFICADO;
  if (crmMatch) {
    if (crmMatch[2] && /^\d+$/.test(crmMatch[2])) {
      crm = crmMatch[2];
      if (crmMatch[1] && /^[A-Z]{2}$/i.test(crmMatch[1])) ufCrm = crmMatch[1].toUpperCase();
    } else if (crmMatch[1] && /^\d+$/.test(crmMatch[1])) {
      crm = crmMatch[1];
      if (crmMatch[2] && /^[A-Z]{2}$/i.test(crmMatch[2])) ufCrm = crmMatch[2].toUpperCase();
    }
  }

  // If UF not found near CRM, look for standalone UF pattern
  if (ufCrm === CAMPO_NAO_IDENTIFICADO) {
    const ufMatch = t.match(/(?:CRM)[\s\-/]*([A-Z]{2})/im);
    if (ufMatch && ufMatch[1]) ufCrm = ufMatch[1].toUpperCase();
  }

  const dataEmissao = extrair(t, [
    /(?:data de emiss[aã]o|emitido em|data)[:\s]*(\d{2}[/\-.](\d{2})[/\-.](\d{2,4}))/im,
  ]);

  const horaEmissao = extrair(t, [
    /(?:hora|hor[aá]rio)[:\s]*(\d{2}:\d{2}(?::\d{2})?)/im,
    /(?:às|as)\s+(\d{2}:\d{2})/im,
  ]);

  const diasAfastamento = extrair(t, [
    /(?:afastamento|afastado|repous|repouso)[^\d]*(\d{1,3})\s*(?:dia|dias)/im,
    /(\d{1,3})\s*(?:dia|dias)\s*(?:de)?\s*(?:afastamento|repouso|dispensa)/im,
    /(\d{1,3})\s*\(?dias?\)?/im,
  ]);

  const dataInicioAfastamento = extrair(t, [
    /(?:in[ií]cio|a partir de|de)[:\s]*(\d{2}[/\-.](\d{2})[/\-.](\d{2,4}))/im,
  ]);

  const dataFimAfastamento = extrair(t, [
    /(?:t[eé]rmino|at[eé]|final|fim)[:\s]*(\d{2}[/\-.](\d{2})[/\-.](\d{2,4}))/im,
  ]);

  const nomeClinica = extrair(t, [
    /(?:cl[ií]nica|hospital|laborat[oó]rio|unidade|estabelecimento)[:\s]+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s&.]{2,})/im,
  ]);

  const cnpjEstabelecimento = extrair(t, [
    /(?:CNPJ)[:\s]*(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[\-\s]?\d{2})/im,
    /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/m,
  ]);

  const codigoValidacao = extrair(t, [
    /(?:c[oó]digo de valida[cç][aã]o|c[oó]d\.?\s*valid|hash|chave de valida)[:\s]*([A-Za-z0-9\-]{6,})/im,
    /(?:valida[cç][aã]o)[:\s]*([A-Za-z0-9\-]{6,})/im,
  ]);

  // QR Code detection heuristic - expanded patterns
  const qrCodeDetectado =
    /qr\s*code/im.test(t) ||
    /https?:\/\/[^\s]+validador[^\s]*/im.test(t) ||
    /https?:\/\/[^\s]+verifica[^\s]*/im.test(t) ||
    /https?:\/\/[^\s]+consulta[^\s]*/im.test(t) ||
    /https?:\/\/[^\s]+atestado[^\s]*/im.test(t) ||
    /https?:\/\/[^\s]+cfm\.org\.br[^\s]*/im.test(t) ||
    /https?:\/\/[^\s]+crm[^\s]*/im.test(t) ||
    /https?:\/\/[^\s]+gov\.br[^\s]*/im.test(t);

  let qrCodeConteudo = CAMPO_NAO_IDENTIFICADO;
  if (qrCodeDetectado) {
    // Try to find the most specific URL first, then fall back to any URL
    const specificUrlMatch = t.match(
      /https?:\/\/[^\s]+(?:validador|verifica|consulta|atestado|cfm\.org\.br|crm|gov\.br)[^\s]*/im,
    );
    if (specificUrlMatch) {
      qrCodeConteudo = specificUrlMatch[0].replace(/[.,;)\]]+$/, ""); // clean trailing punctuation
    } else {
      // Fall back to any URL in the document
      const anyUrlMatch = t.match(/https?:\/\/[^\s]{8,}/im);
      if (anyUrlMatch) {
        qrCodeConteudo = anyUrlMatch[0].replace(/[.,;)\]]+$/, "");
      }
    }
  }

  // Digital signature detection
  const assinaturaDigitalDetectada =
    /assinatura\s*digital/im.test(t) ||
    /assinado\s*digitalmente/im.test(t) ||
    /certificado\s*digital/im.test(t) ||
    /ICP-Brasil/im.test(t);

  // CID extraction
  let cid = CAMPO_NAO_IDENTIFICADO;
  let cidDescricao = "";
  const cidMatch = t.match(/(?:CID)[:\s\-]*([A-Z]\d{2,3}(?:\.\d{1,2})?)/im);
  if (cidMatch && cidMatch[1]) {
    cid = cidMatch[1].toUpperCase();
    cidDescricao = getCidDescricao(cid);
  }

  return {
    nomePaciente,
    cpf,
    nomeMedico,
    crm,
    ufCrm,
    dataEmissao,
    horaEmissao,
    diasAfastamento,
    dataInicioAfastamento,
    dataFimAfastamento,
    nomeClinica,
    cnpjEstabelecimento,
    codigoValidacao,
    qrCodeDetectado,
    qrCodeConteudo,
    assinaturaDigitalDetectada,
    cid,
    cidDescricao,
  };
}

/* ── Detect PDF digital signature presence ── */
async function detectarAssinaturaPdf(
  file: File,
): Promise<{ temAssinatura: boolean; integro: boolean }> {
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    return { temAssinatura: false, integro: true };
  }

  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const text = new TextDecoder("latin1").decode(bytes);

    // Look for PDF signature markers
    const temAssinatura =
      text.includes("/Type /Sig") ||
      text.includes("/SubFilter /adbe.pkcs7") ||
      text.includes("/SubFilter /ETSI.CAdES") ||
      text.includes("/ByteRange");

    // Simple integrity check: look for incremental updates after signature
    let integro = true;
    if (temAssinatura) {
      const lastByteRange = text.lastIndexOf("/ByteRange");
      const lastEof = text.lastIndexOf("%%EOF");
      if (lastByteRange > -1 && lastEof > -1) {
        const afterSig = text.slice(lastEof + 5).trim();
        if (afterSig.length > 10) {
          integro = false; // Content added after last signature EOF
        }
      }
    }

    return { temAssinatura, integro };
  } catch {
    return { temAssinatura: false, integro: true };
  }
}

/* ── Date coherence check ── */
function verificarCoerenciaDatas(dados: DadosExtraidos): { coerente: boolean; motivo: string } {
  function parseDate(d: string): Date | null {
    if (!d || d === CAMPO_NAO_IDENTIFICADO) return null;
    const parts = d.match(/(\d{2})[/\-\.](\d{2})[/\-\.](\d{2,4})/);
    if (!parts) return null;
    const day = parseInt(parts[1]!, 10);
    const month = parseInt(parts[2]!, 10) - 1;
    let year = parseInt(parts[3]!, 10);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
  }

  const emissao = parseDate(dados.dataEmissao);
  const inicio = parseDate(dados.dataInicioAfastamento);
  const fim = parseDate(dados.dataFimAfastamento);

  if (!emissao && !inicio && !fim) {
    return { coerente: true, motivo: "Datas não disponíveis para verificação" };
  }

  if (emissao && inicio && emissao > inicio) {
    return { coerente: false, motivo: "Data de emissão posterior ao início do afastamento" };
  }

  if (inicio && fim && inicio > fim) {
    return { coerente: false, motivo: "Data de início posterior à data de fim do afastamento" };
  }

  if (emissao && fim && emissao > fim) {
    return { coerente: false, motivo: "Data de emissão posterior ao fim do afastamento" };
  }

  const dias =
    dados.diasAfastamento !== CAMPO_NAO_IDENTIFICADO ? parseInt(dados.diasAfastamento) : null;
  if (inicio && fim && dias !== null && !isNaN(dias)) {
    const diffMs = fim.getTime() - inicio.getTime();
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (Math.abs(diffDias - dias) > 1) {
      return {
        coerente: false,
        motivo: `Diferença entre datas (${diffDias} dias) não confere com dias de afastamento informados (${dias} dias)`,
      };
    }
  }

  return { coerente: true, motivo: "Datas coerentes" };
}

/* ── QR Code domain check ── */
const DOMINIOS_OFICIAIS = [
  // Governo e saúde
  "gov.br",
  "saude.gov.br",
  "ans.gov.br",
  "datasus.gov.br",
  // CFM e CRMs estaduais
  "cfm.org.br",
  "portalmedico.org.br",
  "cremesp.org.br",
  "cremeb.org.br",
  "cremerj.org.br",
  "crememg.org.br",
  "cremers.org.br",
  "cremepe.org.br",
  "cremego.org.br",
  "cremepr.org.br",
  "cremesc.org.br",
  "cremeba.org.br",
  "cremece.org.br",
  "cremeam.org.br",
  "cremeal.org.br",
  "cremepa.org.br",
  "cremern.org.br",
  "cremepb.org.br",
  "cremese.org.br",
  "cremema.org.br",
  "cremepi.org.br",
  "cremeto.org.br",
  "cremems.org.br",
  "crememt.org.br",
  "cremero.org.br",
  "cremeac.org.br",
  "cremeap.org.br",
  "cremerr.org.br",
  "cremees.org.br",
  "cremedf.org.br",
  // ICP-Brasil e certificação digital
  "validador.iti.gov.br",
  "iti.gov.br",
  // Plataformas de atestado digital conhecidas
  "memed.com.br",
  "nexodata.com.br",
  "atestado.digital",
  "validcertificado.com.br",
  "consultamedica.com.br",
  "amplimed.com.br",
  "iclinic.com.br",
  "prontmed.com",
  "tuotempo.com",
  "doctoralia.com.br",
  "conexasaude.com.br",
  "telemedicina.com.br",
];

function verificarDominioQrCode(url: string): { oficial: boolean; dominio: string } {
  if (!url || url === CAMPO_NAO_IDENTIFICADO) return { oficial: false, dominio: "" };
  try {
    const parsed = new URL(url);
    const dominio = parsed.hostname.toLowerCase();
    const oficial = DOMINIOS_OFICIAIS.some((d) => dominio === d || dominio.endsWith("." + d));
    return { oficial, dominio };
  } catch {
    return { oficial: false, dominio: url };
  }
}

/* ── Build validations ── */
function construirValidacoes(
  dados: DadosExtraidos,
  assinatura: { temAssinatura: boolean; integro: boolean },
): ValidacaoItem[] {
  const validacoes: ValidacaoItem[] = [];
  let idCounter = 0;
  const nextId = () => `val-${++idCounter}`;

  // 1. Digital signature presence
  validacoes.push({
    id: nextId(),
    descricao: "Verificação de assinatura digital no PDF",
    resultado: assinatura.temAssinatura ? "aprovado" : "nao_verificavel",
    detalhes: assinatura.temAssinatura
      ? "Assinatura digital detectada no documento"
      : "Nenhuma assinatura digital encontrada no documento",
    origem: "Análise estrutural do PDF",
    impactoPontuacao: assinatura.temAssinatura ? -15 : 10,
  });

  // 2. Signature integrity
  if (assinatura.temAssinatura) {
    validacoes.push({
      id: nextId(),
      descricao: "Integridade da assinatura digital",
      resultado: assinatura.integro ? "aprovado" : "reprovado",
      detalhes: assinatura.integro
        ? "Documento aparenta estar íntegro (sem modificações após assinatura)"
        : "Documento possivelmente modificado após assinatura digital",
      origem: "Análise de ByteRange do PDF",
      impactoPontuacao: assinatura.integro ? -10 : 25,
    });
  }

  // 3. QR Code and domain
  if (dados.qrCodeDetectado) {
    const { oficial, dominio } = verificarDominioQrCode(dados.qrCodeConteudo);
    validacoes.push({
      id: nextId(),
      descricao: "Verificação do QR Code",
      resultado: oficial ? "aprovado" : "pendente",
      detalhes: oficial
        ? `QR Code aponta para domínio oficial reconhecido: ${dominio}`
        : dados.qrCodeConteudo !== CAMPO_NAO_IDENTIFICADO
          ? `QR Code aponta para domínio não reconhecido: ${dominio}. Requer verificação manual.`
          : "QR Code detectado mas URL não pôde ser extraída. Requer verificação manual.",
      origem: "Análise de URL no texto extraído",
      impactoPontuacao: oficial ? -10 : 15,
    });
  } else {
    validacoes.push({
      id: nextId(),
      descricao: "Detecção de QR Code",
      resultado: "nao_verificavel",
      detalhes: "Nenhum QR Code detectado no documento",
      origem: "Análise do texto extraído",
      impactoPontuacao: 5,
    });
  }

  // 4. Validation code
  validacoes.push({
    id: nextId(),
    descricao: "Código de validação",
    resultado: dados.codigoValidacao !== CAMPO_NAO_IDENTIFICADO ? "pendente" : "nao_verificavel",
    detalhes:
      dados.codigoValidacao !== CAMPO_NAO_IDENTIFICADO
        ? `Código encontrado: ${dados.codigoValidacao}. Verificação manual necessária no validador oficial.`
        : "Nenhum código de validação encontrado no documento",
    origem: "Extração OCR",
    impactoPontuacao: dados.codigoValidacao !== CAMPO_NAO_IDENTIFICADO ? 0 : 5,
  });

  // 5. CRM verification (manual)
  validacoes.push({
    id: nextId(),
    descricao: "Verificação do CRM",
    resultado: dados.crm !== CAMPO_NAO_IDENTIFICADO ? "pendente" : "nao_verificavel",
    detalhes:
      dados.crm !== CAMPO_NAO_IDENTIFICADO
        ? `CRM ${dados.crm}${dados.ufCrm !== CAMPO_NAO_IDENTIFICADO ? "/" + dados.ufCrm : ""} encontrado. Verificar no portal do CFM.`
        : "CRM não identificado no documento",
    origem: "Extração OCR",
    impactoPontuacao: dados.crm !== CAMPO_NAO_IDENTIFICADO ? 0 : 15,
  });

  // 6. Date coherence
  const datas = verificarCoerenciaDatas(dados);
  validacoes.push({
    id: nextId(),
    descricao: "Coerência entre datas",
    resultado: datas.coerente ? "aprovado" : "reprovado",
    detalhes: datas.motivo,
    origem: "Análise lógica dos dados extraídos",
    impactoPontuacao: datas.coerente ? -5 : 20,
  });

  // 7. Essential fields presence
  const camposEssenciais: (keyof DadosExtraidos)[] = [
    "nomePaciente",
    "nomeMedico",
    "crm",
    "dataEmissao",
    "diasAfastamento",
  ];
  const camposAusentes = camposEssenciais.filter(
    (c) => dados[c] === CAMPO_NAO_IDENTIFICADO || dados[c] === "" || dados[c] === false,
  );
  validacoes.push({
    id: nextId(),
    descricao: "Campos essenciais preenchidos",
    resultado: camposAusentes.length === 0 ? "aprovado" : "reprovado",
    detalhes:
      camposAusentes.length === 0
        ? "Todos os campos essenciais foram identificados"
        : `Campos não identificados: ${camposAusentes.join(", ")}`,
    origem: "Extração OCR",
    impactoPontuacao: camposAusentes.length * 5,
  });

  // 8. Digital signature text mention
  if (dados.assinaturaDigitalDetectada) {
    validacoes.push({
      id: nextId(),
      descricao: "Menção a assinatura digital no texto",
      resultado: "aprovado",
      detalhes:
        "O documento menciona assinatura digital ou certificado ICP-Brasil no corpo do texto",
      origem: "Análise do texto extraído",
      impactoPontuacao: -5,
    });
  }

  return validacoes;
}

/* ── Build inconsistencies ── */
function construirInconsistencias(
  dados: DadosExtraidos,
  assinatura: { temAssinatura: boolean; integro: boolean },
  validacoes: ValidacaoItem[],
): Inconsistencia[] {
  const items: Inconsistencia[] = [];
  let idCounter = 0;
  const nextId = () => `inc-${++idCounter}`;

  if (assinatura.temAssinatura && !assinatura.integro) {
    items.push({
      id: nextId(),
      tipo: "Integridade",
      descricao: "Documento possivelmente alterado após assinatura digital",
      severidade: "alta",
    });
  }

  if (dados.crm === CAMPO_NAO_IDENTIFICADO) {
    items.push({
      id: nextId(),
      tipo: "Dados médicos",
      descricao: "CRM do médico não identificado no documento",
      severidade: "media",
    });
  }

  const datas = verificarCoerenciaDatas(dados);
  if (!datas.coerente) {
    items.push({
      id: nextId(),
      tipo: "Datas",
      descricao: datas.motivo,
      severidade: "alta",
    });
  }

  if (dados.qrCodeDetectado) {
    const { oficial } = verificarDominioQrCode(dados.qrCodeConteudo);
    if (!oficial && dados.qrCodeConteudo !== CAMPO_NAO_IDENTIFICADO) {
      items.push({
        id: nextId(),
        tipo: "QR Code",
        descricao: `URL do QR Code aponta para domínio não reconhecido como oficial: ${dados.qrCodeConteudo}`,
        severidade: "media",
      });
    }
  }

  if (dados.nomeMedico === CAMPO_NAO_IDENTIFICADO) {
    items.push({
      id: nextId(),
      tipo: "Dados médicos",
      descricao: "Nome do médico não identificado no documento",
      severidade: "media",
    });
  }

  if (dados.nomePaciente === CAMPO_NAO_IDENTIFICADO) {
    items.push({
      id: nextId(),
      tipo: "Dados do paciente",
      descricao: "Nome do paciente não identificado no documento",
      severidade: "media",
    });
  }

  return items;
}

/* ── Calculate risk score ── */
function calcularPontuacao(validacoes: ValidacaoItem[], inconsistencias: Inconsistencia[]): number {
  let base = 30;
  for (const v of validacoes) {
    base += v.impactoPontuacao;
  }
  for (const inc of inconsistencias) {
    if (inc.severidade === "alta") base += 15;
    else if (inc.severidade === "media") base += 8;
    else base += 3;
  }
  return Math.min(100, Math.max(0, base));
}

function classificar(
  dados: DadosExtraidos,
  assinatura: { temAssinatura: boolean; integro: boolean },
  pontuacao: number,
  textoVazio: boolean,
): ClassificacaoAtestado {
  if (textoVazio) return "Documento ilegível";
  if (assinatura.temAssinatura && !assinatura.integro) return "Documento alterado após assinatura";
  if (assinatura.temAssinatura && assinatura.integro && pontuacao < 30)
    return "Validado eletronicamente";
  if (pontuacao >= 70) return "Inconsistências encontradas";
  if (pontuacao >= 30) return "Necessita revisão manual";
  if (dados.assinaturaDigitalDetectada || dados.qrCodeDetectado) return "Validado eletronicamente";
  return "Sem validação eletrônica disponível";
}

/* ── Main entry point ── */
export async function verificarAtestado(file: File): Promise<ResultadoVerificacao> {
  const [hash, texto, assinatura] = await Promise.all([
    calcularHashSha256(file),
    extrairTexto(file),
    detectarAssinaturaPdf(file),
  ]);

  const dados = extrairDados(texto);

  // Override digital signature flag if detected via PDF structure
  if (assinatura.temAssinatura && !dados.assinaturaDigitalDetectada) {
    dados.assinaturaDigitalDetectada = true;
  }

  const validacoes = construirValidacoes(dados, assinatura);
  const inconsistencias = construirInconsistencias(dados, assinatura, validacoes);
  const pontuacao = calcularPontuacao(validacoes, inconsistencias);
  const faixa: ResultadoVerificacao["faixaRisco"] =
    pontuacao < 30 ? "baixo" : pontuacao < 70 ? "revisao" : "alto";
  const classificacao = classificar(dados, assinatura, pontuacao, texto.trim().length === 0);

  const arquivoUrl = URL.createObjectURL(file);

  const historico: AcaoHistorico[] = [
    {
      id: crypto.randomUUID(),
      acao: "Documento recebido para análise",
      usuario: "Sistema",
      dataHora: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      acao: `Texto extraído (${texto.length} caracteres)`,
      usuario: "Sistema",
      dataHora: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      acao: `Classificação: ${classificacao}`,
      usuario: "Sistema",
      dataHora: new Date().toISOString(),
    },
  ];

  return {
    id: crypto.randomUUID(),
    nomeArquivo: file.name,
    tipoArquivo: file.type,
    tamanhoArquivo: file.size,
    hashSha256: hash,
    dataAnalise: new Date().toISOString(),
    classificacao,
    pontuacaoRisco: pontuacao,
    faixaRisco: faixa,
    dadosExtraidos: dados,
    validacoes,
    inconsistencias,
    historico,
    textoExtraido: texto,
    arquivoUrl,
    observacao: "",
  };
}
