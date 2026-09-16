/**
 * Cálculo de horários das folhas de ponto.
 * Lê os horários de cada dia (entradas/saídas em pares) e soma o tempo trabalhado.
 */

export type DiaFolha = {
  dia: string;
  horarios: string[];
  minutos: number;
  observacao?: string | undefined;
};

export type ResumoFolha = {
  dias: DiaFolha[];
  minutosTotais: number;
};

const RE_HORA = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/g;
const RE_DIA = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b|^\s*(\d{1,2})\b/;

export function minutosParaTexto(minutos: number): string {
  const sinal = minutos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sinal}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function paraMinutos(hora: string): number {
  const m = hora.match(/^(\d{1,2})[:h](\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Soma pares de marcações (entrada/saída). Vira noite é tratado. */
export function minutosDoDia(horarios: string[]): {
  minutos: number;
  observacao?: string | undefined;
} {
  const marcas = horarios.map(paraMinutos);
  let total = 0;
  let observacao: string | undefined;
  for (let i = 0; i + 1 < marcas.length; i += 2) {
    const entrada = marcas[i]!;
    let saida = marcas[i + 1]!;
    if (saida < entrada) {
      saida += 24 * 60; // jornada que passa da meia-noite
      observacao = "vira o dia";
    }
    total += saida - entrada;
  }
  if (marcas.length % 2 !== 0) {
    observacao = "marcação ímpar (falta batida)";
  }
  return { minutos: total, observacao };
}

function normalizarHora(bruto: string): string {
  const m = bruto.match(/^(\d{1,2})[:h](\d{2})$/);
  if (!m) return bruto;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

/**
 * Remove textos jurídicos/rodapés da folha (assinatura eletrônica, ICP Brasil,
 * portarias e medidas provisórias) que não fazem parte das marcações.
 */
export function limparRodape(texto: string): string {
  return texto
    .replace(/assinatura\s+dispensada[\s\S]*?(?:icp\s*[-–]?\s*brasil[^.]*\.|de\s+2008\.)/gi, " ")
    .replace(
      /^.*(?:assinatura\s+digital\s+e\s+carimbo\s+do\s+tempo|portaria\s+mte|medida\s+provis[óo]ria|infraestrutura\s+de\s+chaves\s+p[úu]blicas|icp\s*[-–]?\s*brasil|comit[êe]\s+gestor|assinatura\s+dispensada|controle\s+de\s+jornada\s+de\s+trabalho).*$/gim,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Remove as linhas de identificação/cabeçalho da folha (CPF, PIS, cliente, cargo,
 * empresa, CNPJ, posto, escala, período, "Cartão ponto", "Gerado em"...).
 * Elas não fazem parte das marcações e não devem entrar no cálculo.
 */
export function limparCabecalho(texto: string, opcoes?: { manterEscala?: boolean }): string {
  const rotulos = [
    "cpf",
    "pis",
    "pis/pasep",
    "cliente",
    "cargo",
    "empresa",
    "cnpj",
    "posto",
    "departamento",
    "matr[íi]cula",
    "admiss[ãa]o",
    "colaborador",
    "funcion[áa]rio",
    "nome",
  ];
  if (!opcoes?.manterEscala) rotulos.push("escala", "per[íi]odo");
  const reRotulos = new RegExp(`^\\s*(?:${rotulos.join("|")})\\s*:.*$`, "gim");
  let saida = texto
    .replace(reRotulos, "")
    // rótulos no meio da linha (PDF junta tudo numa linha só)
    .replace(
      new RegExp(
        `(?:${rotulos.join("|")})\\s*:\\s*[^\\n]*?(?=(?:${rotulos.join("|")})\\s*:|$)`,
        "gim",
      ),
      "",
    )
    .replace(/^\s*(?:cart[ãa]o\s+ponto|jornada\s+de\s+trabalho|gerado\s+em[^\n]*)\s*$/gim, "")
    .replace(/gerado\s+em\s+\d{2}\/\d{2}\/\d{4}[^\n]*/gi, "")
    .replace(/cart[ãa]o\s+ponto/gi, "");
  if (!opcoes?.manterEscala) {
    saida = saida.replace(/escala\s*:[^\n]*/gi, "").replace(/per[íi]odo\s*:[^\n]*/gi, "");
  }
  return saida
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extrai os dias e horários de um texto de folha de ponto (colado ou lido do PDF). */
export function lerDiasDoTexto(textoBruto: string): DiaFolha[] {
  const texto = limparCabecalho(limparRodape(textoBruto));

  const dias: DiaFolha[] = [];
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const linhaOriginal of linhas) {
    // ignora linhas de identificação da folha (escala, período...) —
    // elas podem conter horários/datas que não são marcações
    if (/^\s*(escala|per[íi]odo|jornada)\b/i.test(linhaOriginal)) continue;
    // remove os rótulos "Data:", "Marcações:" e descarta o texto do "Motivo:",
    // mantendo as datas e os horários da linha (ex.:
    // "Data: 01/09/2026 Marcações: 07:00 19:00 Motivo: trabalho normal")
    const linha = linhaOriginal
      .replace(/\bmotivo\b\s*:?.*$/i, " ")
      .replace(/\bmarca[çc][õo]es\b\s*:?/gi, " ")
      .replace(/\bdata\b\s*:?/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const horas = Array.from(linha.matchAll(RE_HORA)).map((m) => normalizarHora(`${m[1]}:${m[2]}`));
    const mDia = linha.match(RE_DIA);
    // mantém dias sem batida quando têm data reconhecida (folga/falta entram com 00:00)
    if (!horas.length && !mDia) continue;
    // ignora cabeçalhos de totais
    if (/\bTOTAL(?:IZAÇÃO|IZACAO)?\b/i.test(linha) && horas.length < 2) continue;

    const dia = mDia
      ? mDia[3]
        ? `${mDia[1]!.padStart(2, "0")}/${mDia[2]!.padStart(2, "0")}`
        : mDia[1] && mDia[2]
          ? `${mDia[1].padStart(2, "0")}/${mDia[2].padStart(2, "0")}`
          : String(mDia[4] ?? mDia[1] ?? "").padStart(2, "0")
      : String(dias.length + 1).padStart(2, "0");

    const { minutos, observacao } = minutosDoDia(horas);
    dias.push({
      dia,
      horarios: horas,
      minutos,
      observacao: observacao ?? (horas.length ? undefined : "sem batida"),
    });
  }
  return dias;
}

export function resumir(dias: DiaFolha[]): ResumoFolha {
  return { dias, minutosTotais: dias.reduce((s, d) => s + d.minutos, 0) };
}

/** Lê o texto de todas as páginas de um PDF (camada de texto). */
export async function textoDePdf(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  try {
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    if (worker?.default) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content?.items ?? []) as Array<{ str: string; transform: number[] }>;
    const linhas = new Map<number, Array<{ x: number; str: string }>>();
    for (const it of items) {
      if (!it?.str?.trim() || !Array.isArray(it.transform)) continue;
      const y = Math.round((it.transform[5] ?? 0) / 3) * 3;
      const arr = linhas.get(y) ?? [];
      arr.push({ x: it.transform[4] ?? 0, str: it.str });
      linhas.set(y, arr);
    }
    paginas.push(
      [...linhas.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, arr]) =>
          arr
            .sort((a, b) => a.x - b.x)
            .map((i) => i.str)
            .join(" "),
        )
        .join("\n"),
    );
  }
  try {
    await (doc as unknown as { destroy: () => Promise<void> }).destroy();
  } catch {
    // já liberado
  }
  return paginas;
}

// ---------------------------------------------------------------------------
// Escala, semanas e meses
// ---------------------------------------------------------------------------

/** Procura o campo "Escala:" na folha (ex.: "Escala: 12x36", "ESCALA 44H SEMANAL"). */
export function extrairEscala(texto: string): string | null {
  const m = texto.match(/escala\s*[:\-]?\s*([^\n|;]{2,80})/i);
  if (!m?.[1]) return null;
  return (
    m[1]
      .replace(/\s+per[íi]odo\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,;]+$/, "") || null
  );
}

/** Procura o nome do colaborador no cabeçalho da folha ("Nome:", "Colaborador:", "Funcionário:"). */
export function extrairNomeColaborador(texto: string): string | null {
  const m = texto.match(/(?:colaborador|funcion[áa]rio|nome)\s*[:\-]\s*([^\n]{3,100})/i);
  if (m?.[1]) {
    const nome = m[1]
      .replace(
        /\s+(?:cpf|pis|pis\/pasep|matr[íi]cula|cargo|empresa|cnpj|posto|departamento|admiss[ãa]o|escala|per[íi]odo|cliente)\s*[:\-].*$/i,
        "",
      )
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,;]+$/, "");
    if (nome.length >= 3) return nome;
  }
  // Sem rótulo "Nome:": procura nas primeiras linhas uma linha só de letras
  // maiúsculas (ex.: "TECNICA", "JOAO DA SILVA") — é o nome do colaborador.
  const proibido =
    /(escala|per[íi]odo|data|marca[çc][õo]es|motivo|total|cart[ãa]o|jornada|cpf|pis|cargo|empresa|posto|matr[íi]cula|admiss[ãa]o|cliente|feriado|semanal|mensal|assinatura|p[áa]gina|resumo)/i;
  for (const linha of texto.split(/\r?\n/).slice(0, 25)) {
    const l = linha.replace(/\s+/g, " ").trim();
    if (l.length < 3 || l.length > 60) continue;
    if (/\d/.test(l)) continue;
    if (proibido.test(l)) continue;
    const letras = l.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letras.length < 3) continue;
    const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, "").length;
    if (maiusculas / letras.length < 0.9) continue;
    return l;
  }
  return null;
}

/** Procura o período da folha ("Período: 01/09/2026 até 30/09/2026"). */
export function extrairPeriodo(texto: string): string | null {
  const m = texto.match(/per[íi]odo\s*[:\-]?\s*([^\n]{4,60})/i);
  if (!m?.[1]) return null;
  const periodo = m[1]
    .replace(/\s+(?:escala|cpf|pis|nome|cargo|empresa)\s*[:\-].*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;]+$/, "");
  return periodo || null;
}

/** Descobre o mês/ano de referência da folha (período, competência ou primeira data completa). */
export function extrairReferencia(texto: string): { mes: number; ano: number } | null {
  const completa = texto.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (completa) return { mes: Number(completa[2]), ano: Number(completa[3]) };
  const comp = texto.match(/\b(\d{1,2})\s*[/.-]\s*(\d{4})\b/);
  if (comp) return { mes: Number(comp[1]), ano: Number(comp[2]) };
  return null;
}

export type BlocoResumo = {
  rotulo: string;
  minutos: number;
  quantidadeDias: number;
};

export type ResumoCompleto = {
  escala: string | null;
  dias: DiaFolha[];
  semanas: BlocoResumo[];
  meses: BlocoResumo[];
  minutosTotais: number;
  mediaPorDia: number;
};

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function dataDoDia(dia: string, ref: { mes: number; ano: number } | null): Date | null {
  const partes = dia.split("/");
  const d = Number(partes[0]);
  if (!Number.isFinite(d) || d < 1 || d > 31) return null;
  const mes = partes[1] ? Number(partes[1]) : (ref?.mes ?? new Date().getMonth() + 1);
  const ano = partes[2]
    ? Number(partes[2].length === 2 ? `20${partes[2]}` : partes[2])
    : (ref?.ano ?? new Date().getFullYear());
  if (!Number.isFinite(mes) || !Number.isFinite(ano)) return null;
  const data = new Date(Date.UTC(ano, mes - 1, d));
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Segunda-feira da semana da data (base para o agrupamento semanal). */
function inicioDaSemana(data: Date): Date {
  const copia = new Date(data.getTime());
  const diaSemana = (copia.getUTCDay() + 6) % 7; // 0 = segunda
  copia.setUTCDate(copia.getUTCDate() - diaSemana);
  return copia;
}

function ddmm(data: Date): string {
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Resumo por dia, por semana e por mês, a partir dos dias já calculados. */
export function resumoCompleto(dias: DiaFolha[], texto = ""): ResumoCompleto {
  const ref = extrairReferencia(texto);
  const semanas = new Map<string, BlocoResumo & { ordem: number }>();
  const meses = new Map<string, BlocoResumo & { ordem: number }>();

  for (const d of dias) {
    const data = dataDoDia(d.dia, ref);
    if (!data) continue;

    const seg = inicioDaSemana(data);
    const dom = new Date(seg.getTime());
    dom.setUTCDate(dom.getUTCDate() + 6);
    const chaveSemana = seg.toISOString().slice(0, 10);
    const atualSemana = semanas.get(chaveSemana) ?? {
      rotulo: `Semana ${ddmm(seg)} a ${ddmm(dom)}`,
      minutos: 0,
      quantidadeDias: 0,
      ordem: seg.getTime(),
    };
    atualSemana.minutos += d.minutos;
    if (d.minutos > 0) atualSemana.quantidadeDias += 1;
    semanas.set(chaveSemana, atualSemana);

    const chaveMes = `${data.getUTCFullYear()}-${data.getUTCMonth()}`;
    const atualMes = meses.get(chaveMes) ?? {
      rotulo: `${MESES[data.getUTCMonth()]} de ${data.getUTCFullYear()}`,
      minutos: 0,
      quantidadeDias: 0,
      ordem: Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1),
    };
    atualMes.minutos += d.minutos;
    if (d.minutos > 0) atualMes.quantidadeDias += 1;
    meses.set(chaveMes, atualMes);
  }

  const minutosTotais = dias.reduce((s, d) => s + d.minutos, 0);
  const comMarcacao = dias.filter((d) => d.minutos > 0).length;
  const ordenar = (m: Map<string, BlocoResumo & { ordem: number }>): BlocoResumo[] =>
    [...m.values()]
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ rotulo, minutos, quantidadeDias }) => ({ rotulo, minutos, quantidadeDias }));

  return {
    escala: extrairEscala(texto),
    dias,
    semanas: ordenar(semanas),
    meses: ordenar(meses),
    minutosTotais,
    mediaPorDia: comMarcacao ? minutosTotais / comMarcacao : 0,
  };
}

// ---------------------------------------------------------------------------
// Horas extras
// ---------------------------------------------------------------------------

/** Jornada normal esperada por dia trabalhado, a partir da escala da folha. */
export function jornadaPadraoDaEscala(escala: string | null | undefined): number {
  const t = (escala ?? "").toLowerCase();
  if (/12\s*[x×]\s*36/.test(t)) return 12 * 60;
  if (/24\s*[x×]\s*(48|72)/.test(t)) return 24 * 60;
  if (/6\s*[x×]\s*1/.test(t)) return 7 * 60 + 20;
  const horas = t.match(/(\d{1,2})\s*h(?:oras)?\s*(?:di[áa]ri|por\s*dia)/);
  if (horas?.[1]) return Number(horas[1]) * 60;
  return 8 * 60;
}

export type ExtraDia = {
  dia: string;
  minutos: number;
  extras: number;
  observacao?: string | undefined;
};

/** Minutos acima da jornada normal, por dia e no total. */
export function calcularHorasExtras(
  dias: DiaFolha[],
  jornadaPadrao: number,
): { jornadaPadrao: number; total: number; porDia: ExtraDia[] } {
  const porDia: ExtraDia[] = [];
  let total = 0;
  for (const d of dias) {
    if (d.minutos <= jornadaPadrao) continue;
    const extras = d.minutos - jornadaPadrao;
    total += extras;
    porDia.push({ dia: d.dia, minutos: d.minutos, extras, observacao: d.observacao });
  }
  return { jornadaPadrao, total, porDia };
}
