/**
 * Preenchimento e assinatura de PDFs com pdf-lib.
 *
 * Regras importantes:
 * - O documento original nunca é alterado: sempre trabalhamos sobre uma cópia.
 * - Nada é reescrito ou rasterizado; apenas desenhamos texto e imagens de
 *   assinatura por cima, preservando o conteúdo e a qualidade originais.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CampoDocumento } from "./tipos";
import { TIPOS_ASSINATURA } from "./tipos";
import { gerarMatrizQr } from "./qr";

export type ValoresCampos = Record<string, string>;

function quebrarTexto(texto: string, maxChars: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length > maxChars && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

function dataUrlParaBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Aplica valores de texto e imagens de assinatura nas posições definidas.
 * `assinaturas` mapeia id do campo para PNG em data URL.
 */
export async function aplicarCamposNoPdf(
  pdfOriginal: Uint8Array | ArrayBuffer,
  campos: CampoDocumento[],
  valores: ValoresCampos,
  assinaturas: Record<string, string> = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfOriginal);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const paginas = pdf.getPages();

  for (const campo of campos) {
    const indice = Math.max(0, Math.min(paginas.length - 1, (campo.pagina || 1) - 1));
    const pagina = paginas[indice];
    if (!pagina) continue;
    const { width, height } = pagina.getSize();
    const x = campo.x * width;
    const larguraCampo = Math.max(campo.w * width, 20);
    const alturaCampo = Math.max(campo.h * height, 10);
    const yTopo = height - campo.y * height;

    if (TIPOS_ASSINATURA.includes(campo.tipo)) {
      const dataUrl = assinaturas[campo.id];
      if (!dataUrl) continue;
      try {
        const imagem = await pdf.embedPng(dataUrlParaBytes(dataUrl));
        const escala = Math.min(larguraCampo / imagem.width, alturaCampo / imagem.height);
        const w = imagem.width * escala;
        const h = imagem.height * escala;
        pagina.drawImage(imagem, { x, y: yTopo - h, width: w, height: h });
      } catch {
        // Assinatura inválida: seguimos sem quebrar o documento.
      }
      continue;
    }

    const texto = (valores[campo.id] ?? campo.valor ?? "").trim();
    if (!texto) continue;
    const tamanho = Math.max(7, Math.min(11, alturaCampo * 0.75));
    const maxChars = Math.max(8, Math.floor(larguraCampo / (tamanho * 0.5)));
    const linhas = quebrarTexto(texto, maxChars);
    let y = yTopo - tamanho;
    for (const linha of linhas) {
      pagina.drawText(linha, { x, y, size: tamanho, font: fonte, color: rgb(0, 0, 0) });
      y -= tamanho * 1.2;
      if (y < 10) break;
    }
  }

  return pdf.save();
}

export interface DadosCertificado {
  titulo: string;
  protocolo: string;
  hash: string;
  urlValidacao: string;
  concluidoEm: string;
  signatarios: Array<{
    nome: string;
    email?: string | null;
    assinadoEm?: string | null;
    ip?: string | null;
    dispositivo?: string | null;
  }>;
}

/** Anexa a página de certificado de conclusão com protocolo, hash e QR Code. */
export async function anexarCertificado(
  pdfBytes: Uint8Array | ArrayBuffer,
  dados: DadosCertificado,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pagina = pdf.addPage([595.28, 841.89]);
  const largura = 595.28;
  const preto = rgb(0, 0, 0);
  const vermelho = rgb(0.72, 0.06, 0.09);
  let y = 800;

  const linha = (
    texto: string,
    opcoes: { tamanho?: number; bold?: boolean; cor?: typeof preto; espaco?: number } = {},
  ) => {
    const tamanho = opcoes.tamanho ?? 10;
    pagina.drawText(texto, {
      x: 42,
      y,
      size: tamanho,
      font: opcoes.bold ? negrito : fonte,
      color: opcoes.cor ?? preto,
    });
    y -= tamanho + (opcoes.espaco ?? 5);
  };

  pagina.drawRectangle({ x: 0, y: 806, width: largura, height: 36, color: vermelho });
  pagina.drawText("CERTIFICADO DE CONCLUSÃO DE ASSINATURA", {
    x: 42,
    y: 818,
    size: 13,
    font: negrito,
    color: rgb(1, 1, 1),
  });
  y = 780;

  linha(`Documento: ${dados.titulo}`, { tamanho: 11, bold: true, espaco: 10 });
  linha(`Protocolo: ${dados.protocolo}`);
  linha(`Conclusão: ${dados.concluidoEm}`);
  linha(`Hash SHA-256 do conteudo assinado (sem esta pagina de certificado):`, { bold: true });
  const hash = dados.hash;
  linha(hash.slice(0, 32), { tamanho: 9, espaco: 2 });
  linha(hash.slice(32), { tamanho: 9, espaco: 12 });
  linha("Signatários", { tamanho: 11, bold: true, espaco: 8 });

  for (const s of dados.signatarios) {
    linha(`• ${s.nome}${s.email ? ` — ${s.email}` : ""}`, { tamanho: 10, espaco: 2 });
    linha(
      `   Assinado em ${s.assinadoEm ?? "-"} | IP ${s.ip ?? "-"} | Dispositivo ${(s.dispositivo ?? "-").slice(0, 60)}`,
      { tamanho: 8, espaco: 6 },
    );
  }

  y -= 10;
  linha("Validação de autenticidade", { tamanho: 11, bold: true, espaco: 6 });
  linha(dados.urlValidacao, { tamanho: 9, espaco: 10 });

  try {
    const matriz = await gerarMatrizQr(dados.urlValidacao);
    const lado = 120;
    const modulo = lado / matriz.tamanho;
    const baseX = largura - 42 - lado;
    const baseY = y - lado + 20;
    pagina.drawRectangle({
      x: baseX - 6,
      y: baseY - 6,
      width: lado + 12,
      height: lado + 12,
      color: rgb(1, 1, 1),
      borderColor: preto,
      borderWidth: 0.5,
    });
    for (let l = 0; l < matriz.tamanho; l++) {
      for (let c = 0; c < matriz.tamanho; c++) {
        if (!matriz.modulos[l * matriz.tamanho + c]) continue;
        pagina.drawRectangle({
          x: baseX + c * modulo,
          y: baseY + (matriz.tamanho - 1 - l) * modulo,
          width: modulo,
          height: modulo,
          color: preto,
        });
      }
    }
  } catch {
    // Sem QR Code o protocolo continua válido para consulta manual.
  }

  y -= 24;
  linha(
    "Este certificado comprova a assinatura eletrônica das partes acima, nos termos do art. 10, §2º da",
    { tamanho: 8, espaco: 2 },
  );
  linha(
    "MP 2.200-2/2001. Não se trata de certificado digital ICP-Brasil. Dados tratados conforme a LGPD.",
    { tamanho: 8 },
  );

  return pdf.save();
}

/** Hash SHA-256 em hexadecimal. */
export async function hashSha256(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const fonte = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copia = new Uint8Array(fonte);
  const digest = await crypto.subtle.digest("SHA-256", copia);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
