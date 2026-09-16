/**
 * PDF de HORAS EXTRAS separado por GERENTE DE ÁREA.
 *
 * Regras:
 *  - entram somente as folhas cuja coluna MOTIVO traz HORAS EXTRAS
 *    (a lista já chega filtrada pela varredura de horas-extras-separar);
 *  - o gerente de área de cada folha é definido pelo POSTO da folha, usando os
 *    relatórios do NEXTI CONTROL 2.0 (posto visitado x realizador da tarefa);
 *  - cada gerente gera um PDF próprio e o MESMO arquivo é anexado ao protocolo
 *    salvo criado para ele (protocolo_arquivos + protocolo_folhas);
 *  - os protocolos e PDFs de origem permanecem intactos.
 */
import { supabase } from "@/integrations/supabase/client";
import { caminhoStorage } from "./storage-path";
import { montarPdfHorasExtras, type FolhaHoraExtra } from "./horas-extras-separar";
import { gerenteAreaACanonico } from "./gerentes-area-a";
import { buscarTudoPaginado } from "./supabase-paginacao";

export const SEM_GERENTE = "Sem gerente de área identificado";

function normalizarPosto(valor: string): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export type MapasGerente = {
  /** POSTO (nome normalizado) → gerente de área. */
  porPosto: Map<string, string>;
  /** id do posto no NEXTI → gerente de área. */
  porPostoId: Map<number, string>;
  /** matrícula do colaborador → id do posto. */
  postoPorMatricula: Map<string, number>;
  /** nome do colaborador → id do posto. */
  postoPorNome: Map<string, number>;
  /** nome/matrícula do colaborador → nome do posto (funcionários ativos). */
  nomePostoPorColaborador: Map<string, string>;
};

/**
 * Monta os vínculos POSTO ⇄ GERENTE DE ÁREA e COLABORADOR ⇄ POSTO usando os
 * relatórios do NEXTI CONTROL 2.0, as pessoas do NEXTI e os funcionários ativos.
 */
export async function carregarMapasGerente(): Promise<MapasGerente> {
  const [respostas, pessoas, ativos] = await Promise.all([
    buscarTudoPaginado<{
      workplace_id: number | null;
      workplace_name: string | null;
      supervisor_nome: string | null;
    }>((inicio, fim) =>
      supabase
        .from("nexti_checklist_answers")
        .select("workplace_id, workplace_name, supervisor_nome")
        .range(inicio, fim),
    ),
    buscarTudoPaginado<{
      nome: string | null;
      matricula: string | null;
      workplace_id: number | null;
      workplace_name: string | null;
    }>((inicio, fim) =>
      supabase
        .from("nexti_persons")
        .select("nome, matricula, workplace_id, workplace_name")
        .range(inicio, fim),
    ),
    buscarTudoPaginado<{ nome: string; matricula: string | null; posto: string | null }>(
      (inicio, fim) =>
        supabase.from("funcionarios_ativos").select("nome, matricula, posto").range(inicio, fim),
    ),
  ]);

  const contagemNome = new Map<string, Map<string, number>>();
  const contagemId = new Map<number, Map<string, number>>();
  for (const l of respostas) {
    const gerente = gerenteAreaACanonico(l.supervisor_nome ?? "");
    if (!gerente) continue;
    const posto = normalizarPosto(l.workplace_name ?? "");
    if (posto) {
      const m = contagemNome.get(posto) ?? new Map<string, number>();
      m.set(gerente, (m.get(gerente) ?? 0) + 1);
      contagemNome.set(posto, m);
    }
    if (l.workplace_id) {
      const m = contagemId.get(l.workplace_id) ?? new Map<string, number>();
      m.set(gerente, (m.get(gerente) ?? 0) + 1);
      contagemId.set(l.workplace_id, m);
    }
  }

  const maisFrequente = <K>(origem: Map<K, Map<string, number>>): Map<K, string> => {
    const saida = new Map<K, string>();
    for (const [chave, porGerente] of origem) {
      const melhor = [...porGerente.entries()].sort((a, b) => b[1] - a[1])[0];
      if (melhor) saida.set(chave, melhor[0]);
    }
    return saida;
  };

  const porPosto = maisFrequente(contagemNome);
  const porPostoId = maisFrequente(contagemId);

  const postoPorMatricula = new Map<string, number>();
  const postoPorNome = new Map<string, number>();
  const nomePostoPorColaborador = new Map<string, string>();
  for (const p of pessoas) {
    const mat = normalizarPosto(p.matricula ?? "").replace(/\s+/g, "");
    const nome = normalizarPosto(p.nome ?? "");
    if (p.workplace_id) {
      if (mat && !postoPorMatricula.has(mat)) postoPorMatricula.set(mat, p.workplace_id);
      if (nome && !postoPorNome.has(nome)) postoPorNome.set(nome, p.workplace_id);
    }
    const nomePosto = normalizarPosto(p.workplace_name ?? "");
    if (nomePosto) {
      if (mat && !nomePostoPorColaborador.has(mat)) nomePostoPorColaborador.set(mat, nomePosto);
      if (nome && !nomePostoPorColaborador.has(nome)) nomePostoPorColaborador.set(nome, nomePosto);
    }
  }
  for (const a of ativos) {
    const posto = normalizarPosto(a.posto ?? "");
    if (!posto) continue;
    const mat = normalizarPosto(a.matricula ?? "").replace(/\s+/g, "");
    const nome = normalizarPosto(a.nome ?? "");
    if (mat && !nomePostoPorColaborador.has(mat)) nomePostoPorColaborador.set(mat, posto);
    if (nome && !nomePostoPorColaborador.has(nome)) nomePostoPorColaborador.set(nome, posto);
  }

  return { porPosto, porPostoId, postoPorMatricula, postoPorNome, nomePostoPorColaborador };
}

/** Descobre o gerente de área de uma folha (posto da folha → colaborador → posto). */
export function gerenteDaFolha(f: FolhaHoraExtra, mapas: MapasGerente): string | null {
  const posto = normalizarPosto(f.posto ?? "");
  if (posto) {
    const direto = mapas.porPosto.get(posto);
    if (direto) return direto;
  }
  const mat = normalizarPosto(f.matricula ?? "").replace(/\s+/g, "");
  const nome = normalizarPosto(f.colaborador ?? "");
  const id =
    (mat ? mapas.postoPorMatricula.get(mat) : undefined) ??
    (nome ? mapas.postoPorNome.get(nome) : undefined);
  if (id) {
    const porId = mapas.porPostoId.get(id);
    if (porId) return porId;
  }
  const nomePosto =
    (mat ? mapas.nomePostoPorColaborador.get(mat) : undefined) ??
    (nome ? mapas.nomePostoPorColaborador.get(nome) : undefined);
  if (nomePosto) {
    const porNome = mapas.porPosto.get(nomePosto);
    if (porNome) return porNome;
  }
  return null;
}

export type ProtocoloGerenteHorasExtras = {
  gerente: string;
  protocoloId: string | null;
  titulo: string;
  arquivo: string;
  paginas: number;
  folhas: number;
  bytes: Uint8Array;
};

export type ResultadoHorasExtrasPorGerente = {
  gerentes: ProtocoloGerenteHorasExtras[];
  folhasSemGerente: number;
  totalFolhas: number;
};

function nomeArquivoGerente(gerente: string): string {
  const base = normalizarPosto(gerente).replace(/\s+/g, "_") || "GERENTE";
  return `Folhas_Horas_Extras_${base}.pdf`;
}

/**
 * Gera um PDF de horas extras por gerente de área e cria/atualiza o protocolo
 * salvo do gerente com esse mesmo PDF anexado.
 */
export async function gerarHorasExtrasPorGerente(
  folhas: FolhaHoraExtra[],
  onProgresso?: (mensagem: string) => void,
): Promise<ResultadoHorasExtrasPorGerente> {
  const resultado: ResultadoHorasExtrasPorGerente = {
    gerentes: [],
    folhasSemGerente: 0,
    totalFolhas: 0,
  };
  if (!folhas.length) return resultado;

  const { data: sessao } = await supabase.auth.getUser();
  const userId = sessao.user?.id;
  if (!userId) throw new Error("Faça login novamente para gerar os PDFs.");

  onProgresso?.("Lendo os postos e gerentes de área do NEXTI CONTROL 2.0...");
  const mapas = await carregarMapasGerente();

  const porGerente = new Map<string, FolhaHoraExtra[]>();
  for (const f of folhas) {
    const gerente = gerenteDaFolha(f, mapas) ?? SEM_GERENTE;
    if (gerente === SEM_GERENTE) resultado.folhasSemGerente += 1;
    const lista = porGerente.get(gerente) ?? [];
    lista.push(f);
    porGerente.set(gerente, lista);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  let indice = 0;

  for (const [gerente, lista] of porGerente) {
    indice += 1;
    onProgresso?.(`Gerando PDF de ${gerente} (${indice}/${porGerente.size})...`);

    const empresa = lista.find((f) => f.empresa)?.empresa ?? null;
    const pdf = await montarPdfHorasExtras(lista, empresa);
    if (!pdf) continue;

    const nomeArquivo = nomeArquivoGerente(gerente);
    const titulo = `HORAS EXTRAS - ${gerente}`;

    // Protocolo salvo do gerente (reaproveita quando já existe).
    const { data: existentes, error: erroExistente } = await supabase
      .from("protocolos")
      .select("id")
      .eq("user_id", userId)
      .eq("titulo", titulo)
      .order("created_at", { ascending: false })
      .limit(1);
    if (erroExistente) throw new Error(erroExistente.message);

    let protocoloId = existentes?.[0]?.id ?? null;
    if (!protocoloId) {
      const { data: criado, error: erroCriar } = await supabase
        .from("protocolos")
        .insert({
          titulo,
          user_id: userId,
          empresa,
          data_entrega: hoje,
          observacoes: `Somente folhas com HORAS EXTRAS do gerente de área ${gerente}.`,
        })
        .select("id")
        .single();
      if (erroCriar) throw new Error(erroCriar.message);
      protocoloId = criado.id as string;
    }

    // O MESMO PDF entregue ao usuário é o anexado ao protocolo.
    const caminho = caminhoStorage(protocoloId, nomeArquivo);
    const arquivoPdf = new Blob([pdf.bytes as unknown as BlobPart], { type: "application/pdf" });
    const { error: erroUpload } = await supabase.storage
      .from("folhas-pdf")
      .upload(caminho, arquivoPdf, { contentType: "application/pdf", upsert: true });
    if (erroUpload) throw new Error(`O PDF não pôde ser salvo: ${erroUpload.message}`);

    await supabase
      .from("protocolo_arquivos")
      .delete()
      .eq("protocolo_id", protocoloId)
      .eq("nome", nomeArquivo);
    const { error: erroArquivo } = await supabase.from("protocolo_arquivos").insert({
      protocolo_id: protocoloId,
      nome: nomeArquivo,
      caminho,
      tamanho: arquivoPdf.size,
    });
    if (erroArquivo) throw new Error(`O PDF não pôde ser vinculado: ${erroArquivo.message}`);

    // Folhas do protocolo seguem exatamente a ordem das páginas do PDF.
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

    await supabase
      .from("protocolo_folhas")
      .delete()
      .eq("protocolo_id", protocoloId)
      .eq("arquivo", nomeArquivo);
    const linhas = incluidas.map((f, i) => ({
      protocolo_id: protocoloId!,
      ordem: i + 1,
      pagina: i + 1,
      arquivo: nomeArquivo,
      colaborador: f.colaborador,
      empresa: f.empresa,
      posto: f.posto,
      cargo: f.cargo,
      matricula: f.matricula,
      admissao: f.admissao ?? "",
      conferido: false,
    }));
    if (linhas.length) {
      const { error: erroFolhas } = await supabase.from("protocolo_folhas").insert(linhas);
      if (erroFolhas) throw new Error(erroFolhas.message);
    }

    resultado.gerentes.push({
      gerente,
      protocoloId,
      titulo,
      arquivo: nomeArquivo,
      paginas: pdf.paginas,
      folhas: linhas.length,
      bytes: pdf.bytes,
    });
    resultado.totalFolhas += linhas.length;
  }

  resultado.gerentes.sort((a, b) => a.gerente.localeCompare(b.gerente, "pt-BR"));
  return resultado;
}
