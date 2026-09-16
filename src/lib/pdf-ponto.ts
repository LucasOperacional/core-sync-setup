/**
 * Extração de folhas de ponto a partir de PDFs.
 * Mantém rigorosamente a ordem original das folhas no arquivo.
 */

export type FolhaPonto = {
  id: string;
  ordem: number;
  pagina: number;
  arquivo: string;
  colaborador: string;
  empresa: string;
  posto: string;
  cargo: string;
  matricula: string;
  admissao: string;
  conferido: boolean;
};

const LIMPA = (v: string) =>
  v
    .replace(/\s+/g, " ")
    .replace(/^[:\-–—]\s*/, "")
    .trim();

/** Busca o valor à frente de um rótulo (ex.: "Colaborador: JOÃO") ou na linha seguinte. */
function valorPorRotulo(linhas: string[], rotulos: string[]): string {
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";
    for (const rotulo of rotulos) {
      const re = new RegExp(`${rotulo}\\s*[:\\-–—]?\\s*(.*)`, "i");
      const m = linha.match(re);
      if (!m) continue;
      let valor = LIMPA(m[1] ?? "");
      // corta se houver outro rótulo grudado na mesma linha
      valor = valor.split(/\s{2,}(?=[A-ZÀ-Ú][a-zà-ú]+\s*:)/)[0] ?? valor;
      valor = valor.replace(
        /\b(Matr[íi]cula|Cargo|Fun[çc][ãa]o|Admiss[ãa]o|CNPJ|Empresa|Posto)\b.*$/i,
        "",
      );
      valor = LIMPA(valor);
      if (valor.length > 1) return valor;
      const proxima = LIMPA(linhas[i + 1] ?? "");
      if (proxima && !/[:]/.test(proxima)) return proxima;
    }
  }
  return "";
}

export function extrairCampos(texto: string) {
  const linhas = texto
    .split("\n")
    .map((l) => LIMPA(l))
    .filter(Boolean);

  const colaborador = valorPorRotulo(linhas, [
    "colaborador",
    "funcion[áa]rio",
    "empregado",
    "nome do colaborador",
    "nome",
  ]);
  const empresa = valorPorRotulo(linhas, [
    "empresa",
    "raz[ãa]o social",
    "empregador",
    "estabelecimento",
    "filial",
  ]);
  const posto = valorPorRotulo(linhas, ["posto", "local", "unidade", "filial", "departamento"]);
  const cargo = valorPorRotulo(linhas, ["cargo", "fun[çc][ãa]o"]);
  const matricula = valorPorRotulo(linhas, ["matr[íi]cula", "registro", "c[óo]digo"]);
  const admissao = valorPorRotulo(linhas, ["admiss[ãa]o", "data de admiss[ãa]o"]);

  return { colaborador, empresa, posto, cargo, matricula, admissao, linhas };
}

/** Agrupa o texto de uma página em linhas usando as posições Y dos itens. */
function itensParaTexto(items: Array<{ str: string; transform: number[] }>): string {
  if (!items || !Array.isArray(items) || items.length === 0) return "";

  const linhas = new Map<number, Array<{ x: number; str: string }>>();
  for (const it of items) {
    if (!it || !it.str || !it.str.trim()) continue;
    if (!it.transform || !Array.isArray(it.transform)) continue;
    const y = Math.round((it.transform[5] ?? 0) / 3) * 3;
    const x = it.transform[4] ?? 0;
    const arr = linhas.get(y) ?? [];
    arr.push({ x, str: it.str });
    linhas.set(y, arr);
  }
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, arr]) =>
      arr
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" "),
    )
    .join("\n");
}

export async function lerFolhasDoPdf(file: File, ordemInicial = 0): Promise<FolhaPonto[]> {
  const pdfjs = await import("pdfjs-dist");

  // Configurar worker de forma robusta
  try {
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    if (worker && worker.default) {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    }
  } catch {
    // Se a importação do worker falhar, o pdfjs pode funcionar sem worker (mais lento)
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }

  const buffer = await file.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    return [];
  }

  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  if (!doc || !doc.numPages || doc.numPages === 0) {
    return [];
  }

  const folhas: FolhaPonto[] = [];
  let ultimaEmpresa = "";

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content?.items ?? []) as Array<{ str: string; transform: number[] }>;
    const texto = itensParaTexto(items);
    const campos = extrairCampos(texto);
    if (campos.empresa) ultimaEmpresa = campos.empresa;

    folhas.push({
      id: `${file.name}-${p}`,
      ordem: ordemInicial + folhas.length + 1,
      pagina: p,
      arquivo: file.name,
      colaborador: campos.colaborador || "(não identificado)",
      empresa: campos.empresa || ultimaEmpresa || "(não identificada)",
      posto: campos.posto,
      cargo: campos.cargo,
      matricula: campos.matricula,
      admissao: campos.admissao,
      conferido: false,
    });
  }

  return folhas;
}

export function paraCsv(folhas: FolhaPonto[]): string {
  const cab = [
    "Ordem",
    "Colaborador",
    "Empresa",
    "Posto",
    "Cargo",
    "Matrícula",
    "Admissão",
    "Página",
    "Arquivo",
    "Conferido",
  ];
  const esc = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;
  const linhas = folhas.map((f) =>
    [
      f.ordem,
      f.colaborador,
      f.empresa,
      f.posto,
      f.cargo,
      f.matricula,
      f.admissao,
      f.pagina,
      f.arquivo,
      f.conferido ? "Sim" : "Não",
    ]
      .map(esc)
      .join(";"),
  );
  return [cab.map(esc).join(";"), ...linhas].join("\r\n");
}
