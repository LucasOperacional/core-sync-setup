import { gerenteAreaACanonico } from "./gerentes-area-a";

export type Answer = { question: string; answer: string };

export type Visit = {
  id: string;
  cliente: string;
  local: string;
  posto: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  responsavel: string;
  cargo: string;
  inicio: string | null; // dd/MM/yyyy HH:mm
  fim: string | null;
  duracaoMin: number | null;
  respostas: Answer[];
  conformes: number;
  naoConformes: number;
  relatos: string[];
  arquivo: string;
};

export function parseDateBR(value: string | null): Date | null {
  if (!value) return null;
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
}

const DIACRITICS_RE = /[\u0300-\u036f]/g;

function semAcento(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS_RE, "").trim().toUpperCase();
}

const NEUTRAL = /^(N\/?A|NAO SE APLICA|NAO APLICAVEL|SEM INFORMACAO|NAO INFORMADO|-{1,}|)$/;
/** Respostas que apenas informam que o serviço não existe no posto → neutro. */
const NAO_APLICA =
  /(NAO SE APLICA|NAO APLICAVEL|NAO POSSUI|NAO TEM (NESSE|ESSE|NO |ESTE)|NAO TEM\.?$|NAO EXISTE|NAO HA (NESSE|ESSE|ESTE)|NAO CONTEMPLA|SEM O SERVICO|NAO CONSTA NO CONTRATO|NAO TEM NO CONTRATO|NAO TEM NESSE CONTRATO)/;
/** "Sem problemas / sem ocorrências" é conformidade, não falha. */
const SEM_POSITIVO =
  /\bSEM (PROBLEMA|OCORRENCIA|PENDENCIA|IRREGULARIDADE|ALTERACAO|INTERCORRENCIA|NENHUMA)/;
const NEGATIVE =
  /\b(NAO|PENDENTE|IRREGULAR|INCOMPLET|FALTA|FALTANDO|AUSENTE|REPROVAD|INSATISFATORI|RUIM|PESSIMO|NEGATIV|INEXISTENTE|VENCID|DANIFICAD|QUEBRAD|SUJO|SUJA|SEM )/;
const POSITIVE =
  /\b(SIM|CONFORME|OK|SATISFATORI|ADEQUAD|REGULAR|APROVAD|COMPLET|BOM|BOA|OTIMO|EXCELENTE|PRESENTE|POSITIV|ATENDID|REALIZAD|TRATAD|DE ACORDO|EM ORDEM|NORMALIDADE|CORRETAMENTE)/;

export type ClasseResposta = "conforme" | "nao_conforme" | "neutro";

/** Classifica a resposta de um item do checklist com precisão maior que um simples "não". */
/**
 * Regras dependentes da pergunta: algumas respostas "Não" são o resultado
 * esperado (ou indicam ausência de material no contrato) e contam como conforme.
 */
function regraPorPergunta(question: string | undefined, texto: string): ClasseResposta | null {
  if (!question) return null;
  const q = semAcento(question).toUpperCase();
  // "OCORREU CONTATO DIRETO COM O CLIENTE?" respondida com "Não: <justificativa>" é o esperado.
  if (q.includes("CONTATO DIRETO COM O CLIENTE") && /^NAO\b/.test(texto)) return "conforme";
  // Equipamentos conferidos: quando o contrato não tem material, a resposta é conforme.
  if (
    (q.includes("EQUIPAMENTOS ALOCADOS") || q.includes("FORAM CONFERIDOS")) &&
    /(NAO TEM|NAO POSSUI|SEM|NAO EXISTE|NAO HA)[^.]{0,40}(MATERIAL|EQUIPAMENTO)|NAO CONSTA NO CONTRATO|NAO TEM NESSE CONTRATO/.test(
      texto,
    )
  )
    return "conforme";
  return null;
}

export function classificarResposta(answer: string, question?: string): ClasseResposta {
  const texto = semAcento(answer)
    .replace(/[.;,]+$/g, "")
    .trim();
  if (NEUTRAL.test(texto)) return "neutro";
  if (/^NAO CONFORME/.test(texto)) return "nao_conforme";
  if (/^CONFORME/.test(texto)) return "conforme";
  const porPergunta = regraPorPergunta(question, texto);
  if (porPergunta) return porPergunta;
  if (NAO_APLICA.test(texto)) return "neutro";
  if (SEM_POSITIVO.test(texto)) return "conforme";
  if (NEGATIVE.test(texto)) return "nao_conforme";
  if (POSITIVE.test(texto)) return "conforme";
  return "neutro";
}

export function isConforme(answer: string, question?: string): boolean {
  return classificarResposta(answer, question) === "conforme";
}

const DIACRITICS = /[\u0300-\u036f]/g;

function normalizeQuestion(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/quest[ãa]o\s*\d+\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function chartQuestionKey(question: string): string {
  const normalized = normalizeQuestion(question);
  if (normalized.replace(/[?!\s]+/g, "") === "OEFETIVOESTACOMPLETO") {
    return "O EFETIVO ESTÁ COMPLETO?";
  }
  return question.length > 46 ? `${question.slice(0, 44)}…` : question;
}

function grab(text: string, label: string, stop: string): string {
  // Exige os dois-pontos do rótulo para não confundir "DADOS DO LOCAL" com "LOCAL:".
  const comDoisPontos = new RegExp(`(?:^|\\n|\\s)${label}\\s*:\\s*([\\s\\S]*?)(?=${stop})`, "i");
  const m =
    text.match(comDoisPontos) ??
    text.match(new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=${stop})`, "i"));
  return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Splits a NextiControl PDF text dump into one record per visit and
 * extracts the indicators used by the dashboard.
 */
/** Divide o texto do PDF em um trecho por visita (usado também pela leitura com IA). */
export function dividirVisitas(fullText: string): string[] {
  const blocos = fullText
    .split(/DADOS DO LOCAL/i)
    .slice(1)
    .map((c) => `DADOS DO LOCAL${c}`.trim())
    .filter(Boolean);

  // Se o cabeçalho "DADOS DO LOCAL" não se repetir a cada visita (relatórios
  // consolidados), quebra também por "TAREFA INICIADA" para não perder nenhuma.
  const finais: string[] = [];
  for (const bloco of blocos.length > 0 ? blocos : [fullText]) {
    const tarefas = bloco.match(/TAREFA INICIADA/gi) ?? [];
    if (tarefas.length <= 1) {
      finais.push(bloco);
      continue;
    }
    const partes = bloco.split(/(?=TAREFA INICIADA)/i);
    const cabecalho = partes[0] ?? "";
    for (const parte of partes.slice(1)) {
      finais.push(`${cabecalho}\n${parte}`.trim());
    }
  }
  return finais.filter((t) => t.trim().length > 0);
}

/**
 * Chave estável de uma visita: mesma visita lida de qualquer arquivo (ou relida
 * do mesmo PDF) gera sempre a mesma chave, evitando contagem duplicada.
 */
export function chaveVisita(v: {
  cliente: string;
  local: string;
  posto: string;
  responsavel: string;
  inicio: string | null;
  fim: string | null;
}): string {
  const parte = (s: string) =>
    semAcento(s)
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  return [
    parte(v.local || v.cliente),
    parte(v.posto),
    parte(v.responsavel),
    (v.inicio ?? "").trim(),
    (v.fim ?? "").trim(),
  ].join("|");
}

/** Conta como realizada toda visita com registro do realizador, horário ou checklist. */
export function visitaRealizada(v: {
  inicio: string | null;
  fim?: string | null;
  responsavel?: string;
  relatos?: string[];
  respostas: Answer[];
}): boolean {
  return (
    Boolean(parseDateBR(v.inicio)) ||
    Boolean(v.fim) ||
    v.respostas.length > 0 ||
    (v.relatos?.length ?? 0) > 0 ||
    Boolean(v.responsavel?.trim())
  );
}

export function parseReportText(fullText: string, arquivo: string): Visit[] {
  const chunks = dividirVisitas(fullText);

  const lidas = chunks.map((chunk, index) => {
    const cliente = grab(chunk, "CLIENTE", "LOCAL\\s*:|$");
    const local = grab(chunk, "LOCAL", "[ÁA]REA\\s*:|POSTO|$");
    const posto = grab(chunk, "POSTO/CENTRO DE CUSTO", "ENDERE[ÇC]O\\s*:|$");
    const endereco = grab(chunk, "ENDERE[ÇC]O", "N[ÚU]MERO\\s*:|BAIRRO\\s*:|$");
    const numero = grab(chunk, "N[ÚU]MERO", "BAIRRO\\s*:|$");
    const bairro = grab(chunk, "BAIRRO", "CIDADE\\s*:|$");
    const cidade = grab(chunk, "CIDADE", "UF\\s*:|$");
    const uf = grab(chunk, "UF", "REALIZADOR|$").slice(0, 2);
    const responsavelBruto = grab(chunk, "NOME", "CARGO\\s*:|$");
    // Sempre grava o nome canônico (ex.: "GABRIEL MENDANHA CABRAL") para que
    // variações do relatório caiam no mesmo realizador do dashboard.
    let responsavel = gerenteAreaACanonico(responsavelBruto) ?? responsavelBruto;
    if (!responsavel) {
      // Fallback: procura no trecho o nome de um realizador conhecido.
      const encontrado = gerenteAreaACanonico(chunk.slice(0, 2000));
      if (encontrado) responsavel = encontrado;
    }
    const cargo = grab(chunk, "CARGO", "ETAPAS|DESLOCAMENTO|$");
    const inicio = grab(chunk, "TAREFA INICIADA", "TAREFA FINALIZADA|CHECKLIST|$") || null;
    const fim = grab(chunk, "TAREFA FINALIZADA", "CHECKLIST|Check-in|$") || null;

    const respostas = extrairRespostas(chunk);

    const relatosBlock = chunk.split(/RELATOS DA VISITA/i)[1] ?? "";
    const relatos = relatosBlock
      .split(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/)
      .map((r) =>
        r
          .replace(/ASSINATURAS[\s\S]*$/i, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((r) => r.length > 25);

    const d1 = parseDateBR(inicio);
    const d2 = parseDateBR(fim);

    const classes = respostas.map((r) => classificarResposta(r.answer, r.question));
    const conformes = classes.filter((c) => c === "conforme").length;
    const naoConformes = classes.filter((c) => c === "nao_conforme").length;

    const base = {
      cliente: cliente || "NÃO INFORMADO",
      local: local || cliente,
      posto,
      responsavel,
      inicio,
      fim,
    };
    const chave = chaveVisita(base);
    // Sem data/hora não dá para garantir que dois blocos são a mesma visita:
    // nesse caso cada bloco recebe um id próprio para nunca ser descartado.
    const temHorario = Boolean(inicio || fim);
    const id = temHorario && chave.replace(/\|+/g, "|").length > 6 ? chave : `${arquivo}-${index}`;

    return {
      id,
      ...base,
      endereco: [endereco, numero].filter(Boolean).join(", "),
      bairro,
      cidade,
      uf,
      cargo,
      duracaoMin: d1 && d2 ? Math.round((d2.getTime() - d1.getTime()) / 60000) : null,
      respostas,
      conformes,
      naoConformes,
      relatos,
      arquivo,
    } satisfies Visit;
  });

  // Descarta trechos que não são visitas de verdade e remove repetições do mesmo PDF.
  const vistas = new Map<string, Visit>();
  for (const v of lidas) {
    const temConteudo =
      v.respostas.length > 0 ||
      Boolean(v.inicio) ||
      Boolean(v.fim) ||
      Boolean(v.responsavel) ||
      v.relatos.length > 0 ||
      (v.local && v.local !== "NÃO INFORMADO");
    if (!temConteudo) continue;
    const anterior = vistas.get(v.id);
    // Se a mesma visita aparecer duas vezes, mantém a leitura mais completa.
    if (!anterior || v.respostas.length > anterior.respostas.length) vistas.set(v.id, v);
  }
  return Array.from(vistas.values());
}

/** Remove visitas repetidas de uma lista já consolidada (banco + importações). */
export function deduplicarVisitas(visitas: Visit[]): Visit[] {
  const mapa = new Map<string, Visit>();
  const semChave: Visit[] = [];
  for (const v of visitas) {
    // Visitas sem horário não podem ser agrupadas com segurança: mantém todas.
    if (!v.inicio && !v.fim) {
      semChave.push(v);
      continue;
    }
    const chave = chaveVisita(v);
    const anterior = mapa.get(chave);
    if (!anterior || v.respostas.length > anterior.respostas.length) mapa.set(chave, v);
  }
  return [...Array.from(mapa.values()), ...semChave];
}

const LIXO_RESPOSTA: RegExp[] = [
  /\d{1,4}\s*\/\s*\d{1,4}\s*-\s*\d{2}\/\d{2}\/\d{4}/g, // rodapé "12 / 589 - 31/08/2026"
  /NEXTI CONTROL/gi,
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, // CNPJ do cabeçalho
  /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/g, // data/hora de emissão
  /\bfotos?\b(\s*(anexad\w*|do local))?/gi,
  /\bp[áa]gina\s*\d+/gi,
  /\bassinaturas?\b/gi,
];

function limparTexto(value: string): string {
  return LIXO_RESPOSTA.reduce((acc, re) => acc.replace(re, " "), value)
    .replace(/\s+/g, " ")
    .replace(/^[:\-–\s]+/, "")
    .replace(/[\s:–-]+$/, "")
    .trim();
}

function limparResposta(value: string): string {
  return limparTexto(value);
}

/**
 * Extrai TODOS os pares pergunta/resposta do checklist do NEXTI CONTROL 2.0.
 * Estratégia principal: cada item começa em "Questão N" / "Pergunta N" e o texto
 * da resposta vem depois do rótulo "Resposta". Isso cobre 100% dos itens, inclusive
 * repetições da mesma pergunta em checklists diferentes da mesma visita.
 */
export function extrairRespostas(chunk: string): Answer[] {
  const bloco = chunk.split(/RELATOS DA VISITA/i)[0] ?? chunk;
  const respostas: Answer[] = [];

  const partes = bloco.split(/(?:Quest[ãa]o|Pergunta)\s*\d+\s*/i).slice(1);
  for (const parte of partes) {
    const corte = parte.split(/\bRespostas?\b\s*[:.)-]?/i);
    if (corte.length < 2) continue;
    const question = limparTexto(corte[0] ?? "");
    const answer = limparResposta(
      corte
        .slice(1)
        .join(" ")
        .split(/ASSINATURAS|CHECKLIST\s*:/i)[0] ?? "",
    );
    if (question.length < 4) continue;
    respostas.push({ question, answer });
  }

  if (respostas.length > 0) return respostas;

  // Formatos alternativos (listas numeradas ou pergunta seguida da resposta na linha de baixo).
  const vistas = new Set<string>();
  const padroes: RegExp[] = [
    /^\s*\d{1,2}\s*[).\-]\s*([^\n]{6,160}\?)\s*\n\s*(?:Resposta|R)\s*[:.)-]?\s*([^\n]{1,200})/gim,
    /([^\n]{6,160}\?)\s*\n\s*(SIM|N[ÃA]O|CONFORME|N[ÃA]O CONFORME|N\/?A|N[ÃA]O SE APLICA)\b([^\n]{0,120})/gi,
  ];
  for (const re of padroes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(bloco)) !== null) {
      const q = limparTexto(m[1] ?? "").replace(/^[#\d\s.)\-–]+/, "");
      const a = limparResposta(`${m[2] ?? ""} ${m[3] ?? ""}`);
      if (q.length < 4) continue;
      const chave = `${semAcento(q)}|${semAcento(a)}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      respostas.push({ question: q, answer: a });
    }
    if (respostas.length > 0) break;
  }

  return respostas;
}

export type AnaliseArquivo = {
  arquivo: string;
  paginas: number;
  visitas: number;
  perguntas: number;
  conformes: number;
  naoConformes: number;
  neutros: number;
  ocr: boolean;
  /** Percentual de visitas com pelo menos uma pergunta reconhecida. */
  cobertura: number;
  avisos: string[];
};

/** Consolida a qualidade da leitura para mostrar ao usuário depois da importação. */
export function analisarVisitas(
  visitas: Visit[],
  arquivo: string,
  paginas: number,
  ocr: boolean,
): AnaliseArquivo {
  let perguntas = 0;
  let conformes = 0;
  let naoConformes = 0;
  let neutros = 0;
  let comPerguntas = 0;
  const avisos: string[] = [];

  for (const v of visitas) {
    if (v.respostas.length > 0) comPerguntas += 1;
    perguntas += v.respostas.length;
    // Usa a contagem já consolidada da visita (heurística local ou revisão do Gemini).
    conformes += v.conformes;
    naoConformes += v.naoConformes;
    neutros += Math.max(0, v.respostas.length - v.conformes - v.naoConformes);
    if (!v.inicio) avisos.push(`${v.local || v.cliente}: data/hora de início não reconhecida.`);
    if (v.respostas.length === 0)
      avisos.push(`${v.local || v.cliente}: nenhuma pergunta reconhecida.`);
  }

  const cobertura = visitas.length > 0 ? Math.round((comPerguntas / visitas.length) * 100) : 0;
  if (ocr)
    avisos.unshift(
      "Documento sem texto: a leitura foi feita por OCR, confira os valores críticos.",
    );

  return {
    arquivo,
    paginas,
    visitas: visitas.length,
    perguntas,
    conformes,
    naoConformes,
    neutros,
    ocr,
    cobertura,
    avisos: avisos.slice(0, 8),
  };
}

export type ExtracaoPdf = { texto: string; paginas: number; ocr: boolean };

/**
 * Extrai o texto do PDF respeitando colunas e linhas. Quando o PDF é apenas
 * imagem (escaneado), faz OCR das páginas para garantir 100% de leitura.
 */
export async function extractPdfDocument(file: File): Promise<ExtracaoPdf> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const paginas = doc.numPages;
  let text = "";

  for (let i = 1; i <= paginas; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;
    // Agrupa por linha (Y) e ordena por X para preservar a ordem de leitura.
    const linhas = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of items) {
      if (!item.str.trim()) continue;
      const y = Math.round((item.transform[5] ?? 0) / 3);
      const linha = linhas.get(y) ?? [];
      linha.push({ x: item.transform[4] ?? 0, str: item.str });
      linhas.set(y, linha);
    }
    const ordenadas = Array.from(linhas.entries()).sort((a, b) => b[0] - a[0]);
    for (const [, linha] of ordenadas) {
      text += `${linha
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim()}\n`;
    }
    text += "\n";
  }

  if (text.replace(/\s/g, "").length > 80 * paginas) {
    return { texto: text, paginas, ocr: false };
  }

  // Fallback OCR para relatórios escaneados.
  try {
    const { default: Tesseract } = await import("tesseract.js");
    let ocrText = "";
    for (let i = 1; i <= paginas; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;
      const { data } = await Tesseract.recognize(canvas, "por");
      ocrText += `${data.text}\n\n`;
    }
    if (ocrText.replace(/\s/g, "").length > text.replace(/\s/g, "").length) {
      return { texto: ocrText, paginas, ocr: true };
    }
  } catch (err) {
    console.error("[report-parser] OCR indisponível:", err);
  }

  return { texto: text, paginas, ocr: false };
}

export async function extractPdfText(file: File): Promise<string> {
  return (await extractPdfDocument(file)).texto;
}

/** Dados estruturados devolvidos pela leitura com IA (Gemini). */
export type VisitaIA = {
  cliente: string;
  local: string;
  posto: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  responsavel: string;
  cargo: string;
  inicio: string | null;
  fim: string | null;
  respostas: Array<{ pergunta: string; resposta: string; classificacao: ClasseResposta }>;
  relatos: string[];
};

function preferir(ia: string, local: string): string {
  const a = (ia ?? "").trim();
  return a.length > 0 ? a : local;
}

/**
 * Mescla a leitura local com a leitura do Gemini: a IA preenche campos vazios,
 * completa as perguntas que a heurística não reconheceu e reclassifica cada
 * resposta (conforme / não conforme / neutro) com precisão semântica.
 */
export function mesclarVisitaIA(base: Visit, ia: VisitaIA): Visit {
  const respostas: Answer[] =
    ia.respostas.length >= base.respostas.length
      ? ia.respostas.map((r) => ({ question: r.pergunta, answer: r.resposta }))
      : base.respostas;

  const classes =
    ia.respostas.length >= base.respostas.length
      ? ia.respostas.map((r) => r.classificacao)
      : base.respostas.map((r) => classificarResposta(r.answer, r.question));

  const inicio = ia.inicio ?? base.inicio;
  const fim = ia.fim ?? base.fim;
  const d1 = parseDateBR(inicio);
  const d2 = parseDateBR(fim);

  return {
    ...base,
    cliente: preferir(ia.cliente, base.cliente),
    local: preferir(ia.local, base.local),
    posto: preferir(ia.posto, base.posto),
    endereco: preferir(ia.endereco, base.endereco),
    bairro: preferir(ia.bairro, base.bairro),
    cidade: preferir(ia.cidade, base.cidade),
    uf: preferir(ia.uf, base.uf).slice(0, 2),
    responsavel:
      gerenteAreaACanonico(preferir(ia.responsavel, base.responsavel)) ??
      preferir(ia.responsavel, base.responsavel),
    cargo: preferir(ia.cargo, base.cargo),
    inicio,
    fim,
    duracaoMin: d1 && d2 ? Math.round((d2.getTime() - d1.getTime()) / 60000) : base.duracaoMin,
    respostas,
    conformes: classes.filter((c) => c === "conforme").length,
    naoConformes: classes.filter((c) => c === "nao_conforme").length,
    relatos: ia.relatos.length > base.relatos.length ? ia.relatos : base.relatos,
  };
}
