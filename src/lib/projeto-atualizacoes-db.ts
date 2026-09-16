import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET_ATUALIZACOES = "projeto-atualizacoes";

export type StatusAtualizacao = "recebido" | "em_analise" | "aplicado" | "recusado";

export type ProjetoAtualizacao = {
  id: string;
  nome_arquivo: string;
  versao: string | null;
  observacoes: string | null;
  tamanho_bytes: number;
  total_arquivos: number;
  arquivos: string[];
  status: StatusAtualizacao;
  storage_bucket: string;
  storage_path: string;
  enviado_por: string | null;
  aplicado_em: string | null;
  created_at: string;
};

type Row = Omit<ProjetoAtualizacao, "arquivos"> & { arquivos: unknown };

function normalizar(row: Row): ProjetoAtualizacao {
  const arquivos = Array.isArray(row.arquivos) ? (row.arquivos as string[]) : [];
  return { ...row, arquivos };
}

/** Lê a lista de arquivos dentro do .zip (sem extrair nada no servidor). */
export async function inspecionarZip(
  file: File,
): Promise<{ arquivos: string[]; total: number; versao: string | null }> {
  const zip = await JSZip.loadAsync(file);
  const arquivos: string[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir) arquivos.push(path);
  });
  arquivos.sort((a, b) => a.localeCompare(b));

  let versao: string | null = null;
  const pkgPath = arquivos.find((p) => p === "package.json" || p.endsWith("/package.json"));
  if (pkgPath) {
    try {
      const texto = await zip.file(pkgPath)!.async("string");
      const parsed = JSON.parse(texto) as { version?: string };
      if (typeof parsed.version === "string") versao = parsed.version;
    } catch {
      /* pacote sem versão legível */
    }
  }

  return { arquivos, total: arquivos.length, versao };
}

export async function listarAtualizacoes(): Promise<ProjetoAtualizacao[]> {
  const { data, error } = await supabase
    .from("projeto_atualizacoes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(normalizar);
}

export async function enviarAtualizacao(
  file: File,
  observacoes: string,
  onProgresso?: (etapa: string) => void,
): Promise<ProjetoAtualizacao> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error("Envie um arquivo no formato .zip");
  }

  onProgresso?.("Lendo o conteúdo do pacote...");
  const { arquivos, total, versao } = await inspecionarZip(file);
  if (total === 0) {
    throw new Error("O arquivo .zip está vazio.");
  }

  const { data: sessao } = await supabase.auth.getUser();
  const userId = sessao.user?.id ?? null;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const nomeSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const caminho = `${stamp}-${nomeSeguro}`;

  onProgresso?.("Enviando o pacote...");
  const { error: upErr } = await supabase.storage
    .from(BUCKET_ATUALIZACOES)
    .upload(caminho, file, { upsert: true, contentType: "application/zip" });
  if (upErr) throw new Error(upErr.message);

  onProgresso?.("Registrando a atualização...");
  const { data, error } = await supabase
    .from("projeto_atualizacoes")
    .insert({
      nome_arquivo: file.name,
      versao,
      observacoes: observacoes.trim() || null,
      tamanho_bytes: file.size,
      total_arquivos: total,
      arquivos: arquivos.slice(0, 3000),
      status: "recebido",
      storage_bucket: BUCKET_ATUALIZACOES,
      storage_path: caminho,
      enviado_por: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return normalizar(data as Row);
}

export async function atualizarStatus(id: string, status: StatusAtualizacao): Promise<void> {
  const { error } = await supabase
    .from("projeto_atualizacoes")
    .update({
      status,
      aplicado_em: status === "aplicado" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Extrai TODOS os arquivos do pacote .zip e sobe cada um deles para o
 * armazenamento, dentro da pasta "<pacote>/arquivos/". Ao final marca a
 * atualização como aplicada.
 */
export async function publicarAtualizacao(
  item: ProjetoAtualizacao,
  onProgresso?: (etapa: string) => void,
): Promise<{ enviados: number; falhas: string[] }> {
  onProgresso?.("Baixando o pacote...");
  const { data: blob, error: downErr } = await supabase.storage
    .from(item.storage_bucket)
    .download(item.storage_path);
  if (downErr || !blob) throw new Error(downErr?.message ?? "Pacote não encontrado.");

  onProgresso?.("Abrindo o pacote...");
  const zip = await JSZip.loadAsync(blob);
  const entradas: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir) entradas.push({ path, entry });
  });
  if (entradas.length === 0) throw new Error("O pacote não tem arquivos.");

  const destino = `${item.storage_path}/arquivos`;
  const falhas: string[] = [];
  let enviados = 0;
  const lote = 6;

  for (let i = 0; i < entradas.length; i += lote) {
    const fatia = entradas.slice(i, i + lote);
    onProgresso?.(`Subindo arquivos ${Math.min(i + lote, entradas.length)}/${entradas.length}...`);
    await Promise.all(
      fatia.map(async ({ path, entry }) => {
        try {
          const conteudo = await entry.async("blob");
          const caminho = `${destino}/${path.replace(/^\/+/, "")}`;
          const { error } = await supabase.storage
            .from(item.storage_bucket)
            .upload(caminho, conteudo, { upsert: true });
          if (error) throw new Error(error.message);
          enviados += 1;
        } catch (err) {
          falhas.push(`${path}: ${err instanceof Error ? err.message : "erro"}`);
        }
      }),
    );
  }

  onProgresso?.("Finalizando...");
  await atualizarStatus(item.id, "aplicado");

  return { enviados, falhas };
}

export async function baixarAtualizacao(item: ProjetoAtualizacao): Promise<string | null> {
  const { data } = await supabase.storage
    .from(item.storage_bucket)
    .createSignedUrl(item.storage_path, 3600);
  return data?.signedUrl ?? null;
}

export async function removerAtualizacao(item: ProjetoAtualizacao): Promise<void> {
  await supabase.storage.from(item.storage_bucket).remove([item.storage_path]);
  const { error } = await supabase.from("projeto_atualizacoes").delete().eq("id", item.id);
  if (error) throw new Error(error.message);
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
