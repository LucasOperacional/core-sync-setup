/**
 * Identificação e separação de FOLHAS DE PONTO com HORAS EXTRAS.
 *
 * Fonte de dados: os protocolos já salvos (protocolos + protocolo_folhas +
 * protocolo_arquivos) e os PDFs originais guardados no bucket "folhas-pdf".
 * Para cada página protocolada o texto é lido e a coluna MOTIVO é analisada;
 * quando há lançamento de hora extra a folha entra na separação.
 * Nada é alterado no banco — a leitura é somente consulta.
 */
import { supabase } from "@/integrations/supabase/client";
import { PDFDocument } from "pdf-lib";
import { extrairCampos } from "./pdf-ponto";
import { baixarBytesFolhaPdf as baixarBytes } from "./folhas-pdf-cache";
import { caminhoStorage } from "./storage-path";
import {
  carregarFolhasProtocoladas,
  competenciaDe,
  type FolhaProtocolada,
} from "./separar-pdf-empresa";

/**
 * Termos aceitos como HORA EXTRA — validados EXCLUSIVAMENTE dentro da coluna
 * MOTIVO. Qualquer outro texto da folha é ignorado.
 */
const PADROES_HORA_EXTRA: RegExp[] = [
  /\bHORAS? EXTRAS?\b/,
  /\bHORA EXTRAORDINARIA\b/,
  /\bHORAS EXTRAORDINARIAS\b/,
  /\bHS? EXTRAS?\b/,
  /\bHRS? EXTRAS?\b/,
  /\bH EXTRAS?\b/,
  /\bHE\d{1,3}\b/,
  /\bHEX\b/,
  /\bEXTRAS? (?:50|60|70|75|80|100)\b/,
  /\b(?:50|60|70|75|80|100) EXTRAS?\b/,
  /\bADICIONAL DE HORAS? EXTRAS?\b/,
  /\bHORAS? EXCEDENTES?\b/,
  /\bHRS? EXCEDENTES?\b/,
  /\bH EXCEDENTES?\b/,
  /\bBANCO DE HORAS EXTRAS?\b/,
  /\bPRORROGACAO DE JORNADA\b/,
  /\bJORNADA EXTRAORDINARIA\b/,
  /\bSOBREJORNADA\b/,
  /\bEXTRA NOTURNA\b/,
];

/** Célula curta que é apenas a sigla de hora extra (HE, H E, HE 50%, HE100). */
const RE_SIGLA_HORA_EXTRA = /^H\s?E(?:\s?N)?(?: ?(?:50|60|70|75|80|100))?$/;

/** Cabeçalho da coluna de motivos (aceita "Motivo", "Motivos", "Motivo da ocorrência"). */
const RE_COLUNA_MOTIVO = /^motivos?\b/i;

/** Palavras que indicam que a célula NÃO é hora extra mesmo citando "extra". */
const RE_NEGATIVA =
  /\b(?:SEM|NAO|NAO HOUVE|NENHUMA|ZERO|NAO REALIZOU|NAO POSSUI)\s+(?:HORAS?|HS?|HRS?)?\s*EXTRAS?\b/;

function normalizarParaBusca(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Valida se o texto de uma célula da coluna MOTIVO representa hora extra. */
export function contemHorasExtras(texto: string): boolean {
  const norm = normalizarParaBusca(texto);
  if (!norm) return false;
  if (RE_NEGATIVA.test(norm)) return false;
  if (RE_SIGLA_HORA_EXTRA.test(norm)) return true;
  return PADROES_HORA_EXTRA.some((re) => re.test(norm));
}

/** Linha de totalizador com todas as horas zeradas (ex.: "HORAS EXTRAS 00:00"). */
export function somenteZerado(texto: string): boolean {
  const tempos = texto.match(/\b\d{1,3}[:.]\d{2}\b/g);
  if (!tempos?.length) return false;
  return tempos.every((t) => /^0+[:.]0+$/.test(t));
}

export type FolhaHoraExtra = FolhaProtocolada & {
  /** Página realmente encontrada no PDF salvo (pode diferir da registrada). */
  paginaPdf: number;
  paginaCorrigida: boolean;
  motivos: string[];
  ocorrencias: number;
};

export type ResultadoAnalise = {
  folhas: FolhaHoraExtra[];
  totalProtocolos: number;
  totalFolhas: number;
  paginasAnalisadas: number;
  paginasCorrigidas: number;
  folhasSemPaginaNoPdf: number;
  semPdf: number;
  pdfsIlegiveis: number;
};

export type GrupoHorasExtras = {
  empresa: string;
  competencias: string[];
  folhas: FolhaHoraExtra[];
  colaboradores: number;
  ocorrencias: number;
};

type Item = { str: string; x: number; y: number; largura: number };

function itensDaPagina(items: Array<{ str: string; transform: number[] }>): Item[] {
  const lista: Item[] = [];
  for (const it of items) {
    if (!it?.str?.trim() || !Array.isArray(it.transform)) continue;
    const largura = (it as { width?: number }).width;
    lista.push({
      str: it.str.replace(/\s+/g, " ").trim(),
      x: it.transform[4] ?? 0,
      y: Math.round((it.transform[5] ?? 0) / 3) * 3,
      largura: typeof largura === "number" && largura > 0 ? largura : 0,
    });
  }
  return lista;
}

function agruparLinhas(itens: Item[]): Array<{ y: number; itens: Item[] }> {
  const mapa = new Map<number, Item[]>();
  for (const it of itens) {
    const arr = mapa.get(it.y) ?? [];
    arr.push(it);
    mapa.set(it.y, arr);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, arr]) => ({ y, itens: arr.sort((a, b) => a.x - b.x) }));
}

/**
 * Lê EXCLUSIVAMENTE as colunas MOTIVO da página e devolve as células que contêm
 * horas extras. Se nenhuma coluna MOTIVO existir na página, nada é considerado —
 * nenhuma outra informação da folha é usada como critério.
 *
 * Melhorias de precisão:
 * - percorre TODAS as tabelas com cabeçalho MOTIVO da página (não só a primeira);
 * - calcula o limite direito da coluna pelo próximo cabeçalho real da mesma linha;
 * - junta linhas quebradas (continuação do mesmo motivo) antes de validar;
 * - remove duplicatas preservando a ordem de leitura.
 */
export function motivosDaPagina(items: Array<{ str: string; transform: number[] }>): string[] {
  const linhas = agruparLinhas(itensDaPagina(items));
  if (!linhas.length) return [];

  const encontrados: string[] = [];
  let celulasLidas = 0;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;
    const indice = linha.itens.findIndex((it) => RE_COLUNA_MOTIVO.test(it.str));
    if (indice < 0) continue;

    const cabecalho = linha.itens[indice]!;
    // Próximo cabeçalho à direita: define a borda da coluna MOTIVO.
    const proximo = linha.itens.slice(indice + 1).find((it) => it.x > cabecalho.x + 20);
    const anterior = linha.itens[indice - 1];
    // Cabeçalhos de cartão ponto são CENTRALIZADOS: o texto das células começa
    // bem à esquerda do título "Motivo". A borda esquerda da coluna é, então, o
    // fim do cabeçalho anterior (com folga) e não a posição do próprio título.
    const inicio = anterior
      ? Math.max(anterior.x + anterior.largura + 4, cabecalho.x - 240)
      : cabecalho.x - 240;
    const fim = proximo ? proximo.x + proximo.largura + 40 : cabecalho.x + 360;

    const celulas: string[] = [];
    for (const abaixo of linhas.slice(i + 1)) {
      // Para ao encontrar um novo cabeçalho MOTIVO (outra tabela na página).
      if (abaixo.itens.some((it) => RE_COLUNA_MOTIVO.test(it.str))) break;
      const naColuna = abaixo.itens.filter((it) => it.x >= inicio && it.x < fim);
      const texto = naColuna
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!texto) continue;
      // Só marcações de horário/números: não é descrição de motivo.
      if (!/[A-Za-zÀ-ú]/.test(texto)) continue;
      celulasLidas += 1;

      // Continuação de um motivo quebrado em duas linhas: começa em minúscula
      // ou é apenas um complemento curto sem outras colunas preenchidas.
      const continuacao =
        celulas.length > 0 &&
        naColuna.length > 0 &&
        abaixo.itens.length === naColuna.length &&
        /^[a-zà-ú(]/.test(texto);
      if (continuacao) {
        celulas[celulas.length - 1] = `${celulas[celulas.length - 1]} ${texto}`.trim();
      } else {
        celulas.push(texto);
      }
    }

    for (const motivo of celulas) {
      if (contemHorasExtras(motivo) && !somenteZerado(motivo)) encontrados.push(motivo);
    }
  }

  // Nenhuma célula de motivo legível: varre as linhas da folha procurando
  // lançamentos de hora extra escritos fora de tabela (resumo, totalizadores).
  if (!celulasLidas) {
    for (const l of linhas) {
      const texto = l.itens
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (texto && contemHorasExtras(texto) && !somenteZerado(texto)) {
        encontrados.push(texto.slice(0, 160));
      }
    }
  }

  return Array.from(new Set(encontrados));
}

async function carregarPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  try {
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    if (worker?.default) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }
  return pdfjs;
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Chaves usadas para casar a folha protocolada com a página do PDF. */
function chavesDaFolha(matricula: string, colaborador: string): string[] {
  const chaves: string[] = [];
  const mat = normalizar(matricula).replace(/\s+/g, "");
  if (mat) chaves.push(`M:${mat}`);
  const nome = normalizar(colaborador);
  if (nome && nome !== "NAO IDENTIFICADO") chaves.push(`N:${nome}`);
  return chaves;
}

function textoDaPagina(items: Array<{ str: string; transform: number[] }>): string {
  return agruparLinhas(itensDaPagina(items))
    .map((l) => l.itens.map((it) => it.str).join(" "))
    .join("\n");
}

/** Analisa as folhas protocoladas e devolve apenas as que têm horas extras. */
export async function analisarHorasExtras(
  onProgresso?: (mensagem: string) => void,
): Promise<ResultadoAnalise> {
  const todas = await carregarFolhasProtocoladas(onProgresso);
  const totalProtocolos = todas.totalProtocolos;
  // Somente folhas efetivamente PROTOCOLADAS entram na separação.
  const folhas = todas.folhas.filter((f) => f.status === "Protocolado");

  const comPdf = folhas.filter((f) => !!f.caminho);
  const semPdf = folhas.length - comPdf.length;
  const caminhos = Array.from(new Set(comPdf.map((f) => f.caminho!)));

  const pdfjs = await carregarPdfJs();
  const encontradas: FolhaHoraExtra[] = [];
  let paginasAnalisadas = 0;
  let paginasCorrigidas = 0;
  let folhasSemPaginaNoPdf = 0;
  let pdfsIlegiveis = 0;

  for (let i = 0; i < caminhos.length; i++) {
    const caminho = caminhos[i]!;
    onProgresso?.(`Lendo o PDF protocolado ${i + 1}/${caminhos.length}...`);
    const bytes = await baixarBytes(caminho);
    if (!bytes) {
      pdfsIlegiveis += 1;
      continue;
    }

    let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null = null;
    try {
      doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
    } catch {
      pdfsIlegiveis += 1;
      continue;
    }

    const doArquivo = comPdf.filter((f) => f.caminho === caminho);

    // Lê cada página uma única vez: identifica o colaborador e os motivos.
    const itensPorPagina = new Map<number, Array<{ str: string; transform: number[] }>>();
    const paginasPorChave = new Map<string, number[]>();
    const extrasPorPagina = new Map<number, string[]>();
    const identificada = new Set<number>();
    for (let p = 1; p <= doc.numPages; p++) {
      let items: Array<{ str: string; transform: number[] }> = [];
      try {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        items = (content?.items ?? []) as Array<{ str: string; transform: number[] }>;
      } catch {
        items = [];
      }
      itensPorPagina.set(p, items);
      paginasAnalisadas += 1;

      // Motivos de hora extra lidos SOMENTE na coluna MOTIVO desta página.
      const extras = motivosDaPagina(items).filter(contemHorasExtras);
      if (extras.length) extrasPorPagina.set(p, extras);

      const campos = extrairCampos(textoDaPagina(items));
      const chaves = chavesDaFolha(campos.matricula, campos.colaborador);
      if (chaves.length) identificada.add(p);
      for (const chave of chaves) {
        const lista = paginasPorChave.get(chave) ?? [];
        lista.push(p);
        paginasPorChave.set(chave, lista);
      }
    }

    // Casa cada folha protocolada com a sua página exata dentro do PDF salvo.
    const usadas = new Set<number>();

    for (const folha of doArquivo) {
      const candidatas = chavesDaFolha(folha.matricula, folha.colaborador)
        .flatMap((chave) => paginasPorChave.get(chave) ?? [])
        .filter((p, idx, arr) => arr.indexOf(p) === idx);

      const registrada =
        folha.pagina && folha.pagina >= 1 && folha.pagina <= doc.numPages ? folha.pagina : null;

      let alvo: number | null = null;
      if (candidatas.length) {
        // Só páginas comprovadamente do colaborador; a hora extra decide.
        const comExtra = candidatas.filter((p) => extrasPorPagina.has(p));
        const preferidas = comExtra.length ? comExtra : candidatas;
        const livres = preferidas.filter((p) => !usadas.has(p));
        alvo =
          (registrada && preferidas.includes(registrada) && !usadas.has(registrada)
            ? registrada
            : null) ??
          livres[0] ??
          preferidas[0]!;
      } else if (registrada && !identificada.has(registrada)) {
        // Página sem colaborador legível: aceita a página registrada no protocolo.
        alvo = registrada;
      }

      if (alvo === null) {
        folhasSemPaginaNoPdf += 1;
        continue;
      }
      if (registrada !== alvo) paginasCorrigidas += 1;
      usadas.add(alvo);

      const comExtra = extrasPorPagina.get(alvo);
      if (!comExtra?.length) continue;

      encontradas.push({
        ...folha,
        paginaPdf: alvo,
        paginaCorrigida: registrada !== alvo,
        motivos: Array.from(new Set(comExtra.map((m) => m.slice(0, 160)))),
        ocorrencias: comExtra.length,
      });
    }

    // Libera o documento do pdf.js: sem isso a memória cresce a cada PDF lido.
    itensPorPagina.clear();
    try {
      await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
    } catch {
      // documento já liberado
    }
  }

  encontradas.sort(
    (a, b) =>
      a.empresa.localeCompare(b.empresa, "pt-BR") ||
      a.colaborador.localeCompare(b.colaborador, "pt-BR"),
  );

  return {
    folhas: encontradas,
    totalProtocolos,
    totalFolhas: folhas.length,
    paginasAnalisadas,
    paginasCorrigidas,
    folhasSemPaginaNoPdf,
    semPdf,
    pdfsIlegiveis,
  };
}

export function agruparHorasExtrasPorEmpresa(folhas: FolhaHoraExtra[]): GrupoHorasExtras[] {
  const mapa = new Map<string, FolhaHoraExtra[]>();
  for (const f of folhas) {
    const lista = mapa.get(f.empresa) ?? [];
    lista.push(f);
    mapa.set(f.empresa, lista);
  }
  return Array.from(mapa.entries())
    .map(([empresa, lista]) => ({
      empresa,
      competencias: Array.from(new Set(lista.map((f) => f.competencia))).sort(),
      folhas: lista,
      colaboradores: new Set(lista.map((f) => f.matricula || f.colaborador)).size,
      ocorrencias: lista.reduce((s, f) => s + f.ocorrencias, 0),
    }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
}

function slug(valor: string, alternativa: string): string {
  return (
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "") || alternativa
  );
}

export function nomeArquivoHorasExtras(empresa: string | null, competencia?: string): string {
  const comp = (competencia ?? "").replace(/[^0-9-]/g, "");
  const partes = ["Folhas_com_Horas_Extras"];
  if (empresa) partes.push(slug(empresa, "EMPRESA"));
  if (comp) partes.push(comp);
  return `${partes.join("_")}.pdf`;
}

export type PdfHorasExtras = {
  nomeArquivo: string;
  empresa: string | null;
  bytes: Uint8Array;
  paginas: number;
  colaboradores: number;
};

/** Monta um PDF apenas com as páginas das folhas que têm horas extras. */
export async function montarPdfHorasExtras(
  folhas: FolhaHoraExtra[],
  empresa: string | null = null,
): Promise<PdfHorasExtras | null> {
  const destino = await PDFDocument.create();
  const origens = new Map<string, PDFDocument>();
  const incluidas = new Set<string>();
  const colaboradores = new Set<string>();
  let paginas = 0;

  for (const f of folhas) {
    const numero = f.paginaPdf || f.pagina || 0;
    if (!f.caminho || numero < 1) continue;
    const marca = `${f.caminho}#${numero}`;
    if (incluidas.has(marca)) continue;

    let origem = origens.get(f.caminho);
    if (!origem) {
      const bytes = await baixarBytes(f.caminho);
      if (!bytes) continue;
      try {
        origem = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
      } catch {
        continue;
      }
      origens.set(f.caminho, origem);
    }

    const indice = numero - 1;
    if (indice >= origem.getPageCount()) continue;

    const [pagina] = await destino.copyPages(origem, [indice]);
    destino.addPage(pagina!);
    incluidas.add(marca);
    colaboradores.add(f.matricula || f.colaborador);
    paginas += 1;
  }

  if (!paginas) return null;
  const competencia = folhas[0] ? competenciaDe(folhas[0].dataProtocolo) : undefined;
  return {
    nomeArquivo: nomeArquivoHorasExtras(empresa, competencia),
    empresa,
    bytes: await destino.save(),
    paginas,
    colaboradores: colaboradores.size,
  };
}

export function csvHorasExtras(folhas: FolhaHoraExtra[]): string {
  const cab = [
    "Empresa",
    "Colaborador",
    "Matrícula",
    "Cargo",
    "Posto",
    "Competência",
    "Protocolo",
    "Arquivo",
    "Página",
    "Motivo (horas extras)",
  ];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const linhas = folhas.map((f) =>
    [
      f.empresa,
      f.colaborador,
      f.matricula,
      f.cargo,
      f.posto,
      f.competencia,
      f.protocoloNumero,
      f.arquivo ?? "",
      f.paginaPdf || f.pagina || "",
      f.motivos.join(" | "),
    ]
      .map(esc)
      .join(";"),
  );
  return [cab.map(esc).join(";"), ...linhas].join("\r\n");
}

/* -------------------------------------------------------------------------- */
/* Separação real: retira as folhas com horas extras do protocolo de origem e  */
/* cria um NOVO protocolo somente com elas.                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoSeparacao = {
  protocolosCriados: number;
  folhasMovidas: number;
  novosProtocolos: Array<{ id: string; titulo: string; folhas: number }>;
};

function tituloNovoProtocolo(original: string): string {
  const base = (original || "Protocolo").replace(/\.pdf$/i, "").trim();
  return `HORAS EXTRAS - ${base}`;
}

/**
 * Move para um novo protocolo todas as folhas com horas extras encontradas.
 * Uma folha nunca fica em dois protocolos: ela é inserida no novo e removida
 * do protocolo de origem.
 */
export async function separarHorasExtrasEmNovosProtocolos(
  folhas: FolhaHoraExtra[],
  onProgresso?: (mensagem: string) => void,
): Promise<ResultadoSeparacao> {
  const { data: sessao } = await supabase.auth.getUser();
  const userId = sessao.user?.id;
  if (!userId) throw new Error("Faça login novamente para separar as folhas.");

  const porProtocolo = new Map<string, FolhaHoraExtra[]>();
  for (const f of folhas) {
    const lista = porProtocolo.get(f.protocoloId) ?? [];
    lista.push(f);
    porProtocolo.set(f.protocoloId, lista);
  }
  if (!porProtocolo.size) {
    return { protocolosCriados: 0, folhasMovidas: 0, novosProtocolos: [] };
  }

  const origemIds = Array.from(porProtocolo.keys());
  const { data: origens, error: erroOrigens } = await supabase
    .from("protocolos")
    .select("id, titulo, empresa, observacoes, data_entrega")
    .in("id", origemIds);
  if (erroOrigens) throw new Error(erroOrigens.message);
  const infoOrigem = new Map((origens ?? []).map((p) => [p.id, p]));

  const { data: arquivos } = await supabase
    .from("protocolo_arquivos")
    .select("protocolo_id, nome, caminho, tamanho")
    .in("protocolo_id", origemIds);

  const resultado: ResultadoSeparacao = {
    protocolosCriados: 0,
    folhasMovidas: 0,
    novosProtocolos: [],
  };

  let indice = 0;
  for (const [protocoloId, lista] of porProtocolo) {
    indice += 1;
    const origem = infoOrigem.get(protocoloId);
    if (!origem) continue;
    onProgresso?.(`Separando o protocolo ${indice}/${porProtocolo.size}...`);

    const titulo = tituloNovoProtocolo(origem.titulo);
    // Evita criar o mesmo protocolo de horas extras duas vezes.
    // `limit(1)` é obrigatório: com títulos repetidos, `maybeSingle()` sozinho
    // devolve erro (PGRST116) e a separação inteira falhava.
    const { data: existentes, error: erroExistente } = await supabase
      .from("protocolos")
      .select("id")
      .eq("user_id", userId)
      .eq("titulo", titulo)
      .order("created_at", { ascending: false })
      .limit(1);
    if (erroExistente) throw new Error(erroExistente.message);

    let novoId = existentes?.[0]?.id ?? null;
    if (!novoId) {
      const { data: criado, error: erroCriar } = await supabase
        .from("protocolos")
        .insert({
          titulo,
          user_id: userId,
          empresa: origem.empresa,
          data_entrega: origem.data_entrega,
          observacoes: `Folhas com horas extras separadas do protocolo "${origem.titulo}".`,
        })
        .select("id")
        .single();
      if (erroCriar) throw new Error(erroCriar.message);
      novoId = criado.id;
      resultado.protocolosCriados += 1;

      for (const a of (arquivos ?? []).filter((x) => x.protocolo_id === protocoloId)) {
        const { error: erroArquivo } = await supabase.from("protocolo_arquivos").insert({
          protocolo_id: novoId,
          nome: a.nome,
          caminho: a.caminho,
          tamanho: a.tamanho,
        });
        // Sem o vínculo do PDF o novo protocolo ainda é válido; apenas avisa.
        if (erroArquivo)
          console.warn("[horas-extras] PDF não vinculado ao novo protocolo", erroArquivo.message);
      }
    }

    // Só remove do protocolo de origem as folhas com ordem real (>= 1).
    // Folhas reconhecidas apenas por varredura chegam com ordem 0 e apagariam
    // linhas erradas se entrassem no filtro.
    const ordens = Array.from(
      new Set(lista.map((f) => f.ordem).filter((o) => Number.isInteger(o) && o >= 1)),
    );

    const linhas = lista.map((f, i) => ({
      protocolo_id: novoId!,
      ordem: i + 1,
      pagina: f.paginaPdf || f.pagina || null,
      arquivo: f.arquivo ?? "",
      colaborador: f.colaborador,
      empresa: f.empresa,
      posto: f.posto,
      cargo: f.cargo,
      matricula: f.matricula,
      admissao: f.admissao ?? "",
      conferido: false,
    }));

    const { data: inseridas, error: erroInserir } = await supabase
      .from("protocolo_folhas")
      .insert(linhas)
      .select("id");
    if (erroInserir) throw new Error(erroInserir.message);

    if (ordens.length) {
      const { error: erroRemover } = await supabase
        .from("protocolo_folhas")
        .delete()
        .eq("protocolo_id", protocoloId)
        .in("ordem", ordens);
      if (erroRemover) {
        // Desfaz a cópia para a folha não ficar em dois protocolos ao mesmo tempo.
        const ids = (inseridas ?? []).map((r) => r.id);
        if (ids.length) await supabase.from("protocolo_folhas").delete().in("id", ids);
        throw new Error(
          `As folhas foram copiadas, mas não puderam ser retiradas do protocolo de origem: ${erroRemover.message}`,
        );
      }
    }

    resultado.folhasMovidas += linhas.length;
    resultado.novosProtocolos.push({ id: novoId!, titulo, folhas: linhas.length });
  }

  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Protocolos salvos SOMENTE das folhas com horas extras (não destrutivo):     */
/* cada protocolo de origem gera um novo protocolo salvo com um PDF próprio    */
/* contendo apenas as páginas cuja coluna MOTIVO traz HORAS EXTRAS.            */
/* -------------------------------------------------------------------------- */

export type ProtocoloHorasExtrasCriado = {
  id: string;
  titulo: string;
  folhas: number;
  arquivo: string;
  paginas: number;
};

export type ResultadoProtocolosHorasExtras = {
  criados: ProtocoloHorasExtrasCriado[];
  jaExistentes: number;
  folhas: number;
};

/**
 * Cria (ou reaproveita) um protocolo salvo por protocolo de origem contendo
 * apenas as folhas com horas extras, com um PDF próprio anexado.
 * O protocolo de origem permanece intacto.
 */
export async function criarProtocolosSalvosHorasExtras(
  folhas: FolhaHoraExtra[],
  onProgresso?: (mensagem: string) => void,
): Promise<ResultadoProtocolosHorasExtras> {
  const { data: sessao } = await supabase.auth.getUser();
  const userId = sessao.user?.id;
  if (!userId) throw new Error("Faça login novamente para criar os protocolos.");

  const porProtocolo = new Map<string, FolhaHoraExtra[]>();
  for (const f of folhas) {
    const id = f.protocoloId || f.caminho || "sem-protocolo";
    const lista = porProtocolo.get(id) ?? [];
    lista.push(f);
    porProtocolo.set(id, lista);
  }

  const resultado: ResultadoProtocolosHorasExtras = { criados: [], jaExistentes: 0, folhas: 0 };
  if (!porProtocolo.size) return resultado;

  const { data: origens } = await supabase
    .from("protocolos")
    .select("id, titulo, empresa, data_entrega")
    .in("id", Array.from(porProtocolo.keys()));
  const infoOrigem = new Map((origens ?? []).map((p) => [p.id, p]));

  const hoje = new Date().toISOString().slice(0, 10);
  let indice = 0;

  for (const [protocoloId, lista] of porProtocolo) {
    indice += 1;
    onProgresso?.(`Criando protocolo ${indice}/${porProtocolo.size}...`);

    const origem = infoOrigem.get(protocoloId);
    const base = (origem?.titulo || lista[0]?.arquivo || "Protocolo").replace(/\.pdf$/i, "").trim();
    const titulo = `HORAS EXTRAS - ${base}`;

    const { data: existentes, error: erroExistente } = await supabase
      .from("protocolos")
      .select("id")
      .eq("user_id", userId)
      .eq("titulo", titulo)
      .order("created_at", { ascending: false })
      .limit(1);
    if (erroExistente) throw new Error(erroExistente.message);
    if (existentes?.[0]?.id) {
      resultado.jaExistentes += 1;
      continue;
    }

    const pdf = await montarPdfHorasExtras(lista, origem?.empresa ?? null);
    if (!pdf) continue;

    const empresa = origem?.empresa ?? lista.find((f) => f.empresa)?.empresa ?? null;
    const { data: criado, error: erroCriar } = await supabase
      .from("protocolos")
      .insert({
        titulo,
        user_id: userId,
        empresa,
        data_entrega: origem?.data_entrega ?? hoje,
        observacoes: `Somente folhas com HORAS EXTRAS separadas do protocolo "${base}".`,
      })
      .select("id")
      .single();
    if (erroCriar) throw new Error(erroCriar.message);
    const novoId = criado.id as string;

    const caminho = caminhoStorage(novoId, pdf.nomeArquivo);
    const arquivoPdf = new Blob([pdf.bytes as unknown as BlobPart], { type: "application/pdf" });
    const { error: erroUpload } = await supabase.storage
      .from("folhas-pdf")
      .upload(caminho, arquivoPdf, { contentType: "application/pdf", upsert: true });
    if (erroUpload) {
      await supabase.from("protocolos").delete().eq("id", novoId);
      throw new Error(`O PDF de horas extras não pôde ser salvo: ${erroUpload.message}`);
    }

    const { error: erroArquivo } = await supabase.from("protocolo_arquivos").insert({
      protocolo_id: novoId,
      nome: pdf.nomeArquivo,
      caminho,
      tamanho: arquivoPdf.size,
    });
    if (erroArquivo) {
      await supabase.storage.from("folhas-pdf").remove([caminho]);
      await supabase.from("protocolos").delete().eq("id", novoId);
      throw new Error(`O PDF foi enviado, mas não pôde ser vinculado: ${erroArquivo.message}`);
    }

    // As páginas do novo PDF seguem a ordem das folhas incluídas.
    const incluidas: FolhaHoraExtra[] = [];
    const vistas = new Set<string>();
    for (const f of lista) {
      const numero = f.paginaPdf || f.pagina || 0;
      if (!f.caminho || numero < 1) continue;
      const marca = `${f.caminho}#${numero}`;
      if (vistas.has(marca)) continue;
      vistas.add(marca);
      incluidas.push(f);
    }

    const linhas = incluidas.map((f, i) => ({
      protocolo_id: novoId,
      ordem: i + 1,
      pagina: i + 1,
      arquivo: pdf.nomeArquivo,
      colaborador: f.colaborador,
      empresa: f.empresa,
      posto: f.posto,
      cargo: f.cargo,
      matricula: f.matricula,
      admissao: f.admissao ?? "",
      conferido: false,
    }));

    const { error: erroFolhas } = await supabase.from("protocolo_folhas").insert(linhas);
    if (erroFolhas) {
      await supabase.storage.from("folhas-pdf").remove([caminho]);
      await supabase.from("protocolos").delete().eq("id", novoId);
      throw new Error(erroFolhas.message);
    }

    resultado.criados.push({
      id: novoId,
      titulo,
      folhas: linhas.length,
      arquivo: pdf.nomeArquivo,
      paginas: pdf.paginas,
    });
    resultado.folhas += linhas.length;
  }

  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Reconhecimento automático: converte as páginas encontradas na varredura     */
/* página a página (com OCR) em folhas com horas extras, casando cada página   */
/* com a folha protocolada correspondente.                                     */
/* -------------------------------------------------------------------------- */

export type PaginaVarrida = {
  protocoloId: string;
  caminho: string;
  arquivo: string;
  pagina: number;
  colaborador: string;
  matricula: string;
  empresa: string;
  motivos: string[];
};

export async function folhasDeVarredura(
  paginas: PaginaVarrida[],
  onProgresso?: (mensagem: string) => void,
): Promise<FolhaHoraExtra[]> {
  if (!paginas.length) return [];
  const { folhas } = await carregarFolhasProtocoladas(onProgresso);

  const porPagina = new Map<string, FolhaProtocolada>();
  const porMatricula = new Map<string, FolhaProtocolada>();
  for (const f of folhas) {
    if (f.caminho && f.pagina) porPagina.set(`${f.caminho}#${f.pagina}`, f);
    const mat = normalizar(f.matricula).replace(/\s+/g, "");
    if (mat && !porMatricula.has(mat)) porMatricula.set(mat, f);
  }

  return paginas.map((p) => {
    const mat = normalizar(p.matricula).replace(/\s+/g, "");
    const base =
      porPagina.get(`${p.caminho}#${p.pagina}`) ?? (mat ? porMatricula.get(mat) : undefined);

    const folha: FolhaProtocolada = base ?? {
      chave: `${p.caminho}#${p.pagina}`,
      protocoloId: p.protocoloId,
      protocoloNumero: "",
      dataProtocolo: "",
      competencia: "",
      colaborador: p.colaborador,
      empresa: p.empresa || "Não identificada",
      empresaIdentificada: !!p.empresa,
      cargo: "",
      posto: "",
      matricula: p.matricula,
      admissao: "",
      ordem: 0,
      pagina: p.pagina,
      arquivo: p.arquivo,
      caminho: p.caminho,
      status: "Protocolado",
    };

    return {
      ...folha,
      colaborador: folha.colaborador || p.colaborador,
      matricula: folha.matricula || p.matricula,
      caminho: p.caminho,
      arquivo: folha.arquivo ?? p.arquivo,
      paginaPdf: p.pagina,
      paginaCorrigida: !!folha.pagina && folha.pagina !== p.pagina,
      motivos: p.motivos,
      ocorrencias: p.motivos.length,
    };
  });
}
