import { supabase } from "@/integrations/supabase/client";
import type { Visit } from "./report-parser";
import { caminhoStorage } from "./storage-path";
import { buscarTudoPaginado } from "./supabase-paginacao";

export type Gerente = { id: string; nome: string; cargo: string; email: string | null };

function normalizeNome(nome: string): string {
  return nome.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Identifica (ou cria) o gerente de área responsável pela visita. */
export async function ensureGerente(nome: string, cargo: string): Promise<string | null> {
  const clean = normalizeNome(nome);
  if (!clean) return null;

  const { data: found } = await supabase
    .from("gerentes")
    .select("id")
    .eq("nome", clean)
    .maybeSingle();
  if (found) return found.id;

  const { data: created, error } = await supabase
    .from("gerentes")
    .insert({ nome: clean, cargo: cargo.trim() })
    .select("id")
    .single();
  if (error) return null;
  return created.id;
}

export async function listGerentes(): Promise<Gerente[]> {
  const { data } = await supabase.from("gerentes").select("id, nome, cargo, email").order("nome");
  return (data ?? []) as Gerente[];
}

export type ResultadoSalvar = { salvas: number; erros: string[] };

/** Grava as visitas em lotes e devolve os erros reais (não silencia falhas). */
export async function saveVisitsDetalhado(visits: Visit[]): Promise<ResultadoSalvar> {
  const erros: string[] = [];
  if (visits.length === 0) return { salvas: 0, erros };

  // Resolve/cria cada gerente uma única vez por nome.
  const cacheGerentes = new Map<string, string | null>();
  for (const v of visits) {
    const chave = normalizeNome(v.responsavel);
    if (!chave || cacheGerentes.has(chave)) continue;
    cacheGerentes.set(chave, await ensureGerente(v.responsavel, v.cargo));
  }

  const linhas = visits.map((v) => ({
    gerente_id: cacheGerentes.get(normalizeNome(v.responsavel)) ?? null,
    cliente: v.cliente,
    local: v.local,
    posto: v.posto,
    endereco: v.endereco,
    bairro: v.bairro,
    cidade: v.cidade,
    uf: v.uf,
    responsavel: v.responsavel,
    cargo: v.cargo,
    inicio: v.inicio,
    fim: v.fim,
    duracao_min: v.duracaoMin,
    respostas: v.respostas,
    conformes: v.conformes,
    nao_conformes: v.naoConformes,
    relatos: v.relatos,
    arquivo: v.arquivo,
    chave: v.id,
  }));

  const LOTE = 40;
  let salvas = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const { error } = await supabase.from("visitas").upsert(lote, { onConflict: "chave" });
    if (error) {
      erros.push(error.message);
      // Tenta linha a linha para salvar o máximo possível do lote.
      for (const linha of lote) {
        const { error: e2 } = await supabase.from("visitas").upsert(linha, { onConflict: "chave" });
        if (!e2) salvas += 1;
      }
    } else {
      salvas += lote.length;
    }
  }

  return { salvas, erros: Array.from(new Set(erros)).slice(0, 3) };
}

export async function saveVisits(visits: Visit[]): Promise<number> {
  return (await saveVisitsDetalhado(visits)).salvas;
}

export async function listVisitas(): Promise<Visit[]> {
  // Lê em páginas: sem isso o banco devolve apenas as primeiras linhas e
  // realizadores inteiros somem do dashboard.
  const data = await buscarTudoPaginado<any>((inicio, fim) =>
    supabase
      .from("visitas")
      .select("*")
      .order("created_at", { ascending: false })
      .range(inicio, fim),
  );

  return (data ?? []).map((row: any) => ({
    id: row.chave,
    cliente: row.cliente,
    local: row.local,
    posto: row.posto,
    endereco: row.endereco,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    responsavel: row.responsavel,
    cargo: row.cargo,
    inicio: row.inicio,
    fim: row.fim,
    duracaoMin: row.duracao_min,
    respostas: (row.respostas ?? []) as Visit["respostas"],
    conformes: row.conformes,
    naoConformes: row.nao_conformes,
    relatos: (row.relatos ?? []) as string[],
    arquivo: row.arquivo,
  }));
}

export async function deleteVisita(chave: string): Promise<void> {
  await supabase.from("visitas").delete().eq("chave", chave);
}

export async function deleteAllVisitas(): Promise<void> {
  await supabase.from("visitas").delete().not("id", "is", null);
}

export const RELATORIOS_BUCKET = "relatorios";

export type ArquivoSalvo = {
  id: string;
  nome: string;
  caminho: string;
  tamanho: number;
  gerenteId: string | null;
  gerenteNome: string;
};

function slug(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "nao-identificado"
  );
}

/** Envia os PDFs para o armazenamento, separando-os por pasta de gerente de área. */
export async function uploadArquivos(files: File[], visits: Visit[]): Promise<number> {
  let enviados = 0;
  for (const file of files) {
    const visita = visits.find((v) => v.arquivo === file.name);
    const responsavel = visita?.responsavel?.trim() ?? "";
    const gerenteId = responsavel ? await ensureGerente(responsavel, visita?.cargo ?? "") : null;
    const pasta = slug(responsavel || "nao-identificado");
    const caminho = caminhoStorage(pasta, file.name);

    const { error: upErr } = await supabase.storage
      .from(RELATORIOS_BUCKET)
      .upload(caminho, file, { upsert: true, contentType: "application/pdf" });
    if (upErr) continue;

    const { error } = await supabase
      .from("arquivos")
      .upsert(
        { gerente_id: gerenteId, nome: file.name, caminho, tamanho: file.size },
        { onConflict: "caminho" },
      );
    if (!error) enviados += 1;
  }
  return enviados;
}

export async function listArquivos(): Promise<ArquivoSalvo[]> {
  const { data } = await supabase
    .from("arquivos")
    .select("id, nome, caminho, tamanho, gerente_id, gerentes(nome)")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    nome: row.nome,
    caminho: row.caminho,
    tamanho: row.tamanho,
    gerenteId: row.gerente_id,
    gerenteNome: (row.gerentes as { nome: string } | null)?.nome ?? "Gerente não identificado",
  }));
}

export async function getArquivoUrl(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from(RELATORIOS_BUCKET).createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

export async function deleteArquivo(id: string, caminho: string): Promise<void> {
  await supabase.storage.from(RELATORIOS_BUCKET).remove([caminho]);
  await supabase.from("arquivos").delete().eq("id", id);
}

export type ResetResumo = {
  visitas: number;
  arquivos: number;
  gerentes: number;
  storage: number;
  erros: string[];
};

/** Lista recursivamente todos os objetos do bucket de relatórios. */
async function listarTodosObjetos(prefixo = ""): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(RELATORIOS_BUCKET)
    .list(prefixo, { limit: 1000 });
  if (error || !data) return [];
  const caminhos: string[] = [];
  for (const item of data) {
    const full = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.id) caminhos.push(full);
    else caminhos.push(...(await listarTodosObjetos(full)));
  }
  return caminhos;
}

/**
 * Apaga TUDO: visitas, PDFs do storage (inclusive órfãos), registros de
 * arquivos, gerentes identificados e o cache local do dashboard.
 */
export async function resetTudo(): Promise<ResetResumo> {
  const resumo: ResetResumo = { visitas: 0, arquivos: 0, gerentes: 0, storage: 0, erros: [] };

  const caminhos = await listarTodosObjetos();
  for (let i = 0; i < caminhos.length; i += 100) {
    const lote = caminhos.slice(i, i + 100);
    const { error } = await supabase.storage.from(RELATORIOS_BUCKET).remove(lote);
    if (error) resumo.erros.push(`Storage: ${error.message}`);
    else resumo.storage += lote.length;
  }

  const arq = await supabase.from("arquivos").delete().not("id", "is", null).select("id");
  if (arq.error) resumo.erros.push(`Arquivos: ${arq.error.message}`);
  else resumo.arquivos = arq.data?.length ?? 0;

  const vis = await supabase.from("visitas").delete().not("id", "is", null).select("id");
  if (vis.error) resumo.erros.push(`Visitas: ${vis.error.message}`);
  else resumo.visitas = vis.data?.length ?? 0;

  const ger = await supabase.from("gerentes").delete().not("id", "is", null).select("id");
  if (ger.error) resumo.erros.push(`Gerentes: ${ger.error.message}`);
  else resumo.gerentes = ger.data?.length ?? 0;

  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("nexti-visitas-v1");
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("nexti-")) localStorage.removeItem(k);
      }
      for (const k of Object.keys(sessionStorage)) {
        if (k.startsWith("nexti-")) sessionStorage.removeItem(k);
      }
    } catch {
      /* storage indisponível */
    }
  }

  return resumo;
}
