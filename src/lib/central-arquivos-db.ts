import { supabase } from "@/integrations/supabase/client";

export const BUCKET_CENTRAL = "arquivos-dashboards";

export type DashboardDestino = "CONTROL" | "FALTAS" | "ATESTADOS";
export type StatusProcessamento = "aguardando" | "processando" | "processado" | "erro";
export type StatusSincronizacao = "aguardando" | "processando" | "atualizado" | "erro";

export interface ArquivoImportado {
  id: string;
  nome_original: string;
  formato: string;
  tamanho: number;
  storage_bucket: string;
  storage_path: string;
  dashboard: DashboardDestino;
  registros: number;
  importado_em: string;
  usuario_id: string | null;
  usuario_nome: string;
  status_processamento: StatusProcessamento;
  status_sincronizacao: StatusSincronizacao;
  ultima_sincronizacao: string | null;
  hash_arquivo: string;
  mensagem_erro: string | null;
}

export interface HistoricoSincronizacao {
  id: string;
  arquivo_id: string | null;
  dashboard: DashboardDestino;
  resultado: "sucesso" | "duplicado" | "sem_alteracao" | "erro";
  mensagem: string;
  registros: number;
  usuario_nome: string;
  created_at: string;
}

export interface ResumoDashboard {
  dashboard: DashboardDestino;
  totalArquivos: number;
  totalRegistros: number;
  ultimoArquivo: string | null;
  ultimaImportacao: string | null;
  ultimaSincronizacao: string | null;
  status: StatusSincronizacao;
  sincronizacaoAutomatica: boolean;
}

export const EVENTO_CENTRAL_ARQUIVOS = "central-arquivos-sync";

export function notificarCentralArquivos() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO_CENTRAL_ARQUIVOS));
  }
}

export function formatoDoArquivo(nome: string): string {
  const partes = nome.toLowerCase().split(".");
  const ext = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  if (["pdf", "csv", "xlsx", "xls"].includes(ext)) return ext;
  return "outro";
}

/** SHA-256 do conteúdo do arquivo, usado para impedir duplicidades. */
export async function calcularHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function usuarioAtual(): Promise<{ id: string | null; nome: string }> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { id: null, nome: "Sistema" };
  const meta = user.user_metadata as { nome?: string; full_name?: string } | undefined;
  return {
    id: user.id,
    nome: meta?.nome ?? meta?.full_name ?? user.email ?? "Usuário",
  };
}

export async function registrarHistorico(entrada: {
  arquivo_id?: string | null;
  dashboard: DashboardDestino;
  resultado: HistoricoSincronizacao["resultado"];
  mensagem: string;
  registros?: number;
}): Promise<void> {
  const user = await usuarioAtual();
  await supabase.from("arquivos_sincronizacoes").insert({
    arquivo_id: entrada.arquivo_id ?? null,
    dashboard: entrada.dashboard,
    resultado: entrada.resultado,
    mensagem: entrada.mensagem,
    registros: entrada.registros ?? 0,
    usuario_id: user.id,
    usuario_nome: user.nome,
  });
}

export interface ResultadoRegistro {
  ok: boolean;
  duplicado: boolean;
  mensagem: string;
  arquivo?: ArquivoImportado;
}

/**
 * Envia o arquivo para o armazenamento e registra na Central de Arquivos.
 * Arquivos com o mesmo hash no mesmo dashboard são considerados duplicados.
 */
export async function registrarArquivoImportado(
  file: File,
  dashboard: DashboardDestino,
  registros: number,
  mensagemErro?: string | null,
): Promise<ResultadoRegistro> {
  try {
    const hash = await calcularHash(file);

    const { data: existente } = await supabase
      .from("arquivos_importados")
      .select("id")
      .eq("dashboard", dashboard)
      .eq("hash_arquivo", hash)
      .maybeSingle();

    if (existente) {
      await registrarHistorico({
        arquivo_id: existente.id,
        dashboard,
        resultado: "duplicado",
        mensagem: `Arquivo duplicado: ${file.name}`,
      });
      notificarCentralArquivos();
      return { ok: false, duplicado: true, mensagem: "Arquivo duplicado." };
    }

    const caminho = `${dashboard.toLowerCase()}/${hash.slice(0, 12)}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: erroUpload } = await supabase.storage
      .from(BUCKET_CENTRAL)
      .upload(caminho, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

    if (erroUpload) throw new Error(erroUpload.message);

    const user = await usuarioAtual();
    const agora = new Date().toISOString();
    const auto = await sincronizacaoAutomaticaAtiva(dashboard);

    const { data, error } = await supabase
      .from("arquivos_importados")
      .insert({
        nome_original: file.name,
        formato: formatoDoArquivo(file.name),
        tamanho: file.size,
        storage_bucket: BUCKET_CENTRAL,
        storage_path: caminho,
        dashboard,
        registros,
        usuario_id: user.id,
        usuario_nome: user.nome,
        status_processamento: mensagemErro ? "erro" : "processado",
        status_sincronizacao: mensagemErro ? "erro" : auto ? "atualizado" : "aguardando",
        ultima_sincronizacao: mensagemErro || !auto ? null : agora,

        hash_arquivo: hash,
        mensagem_erro: mensagemErro ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await registrarHistorico({
      arquivo_id: data.id,
      dashboard,
      resultado: mensagemErro ? "erro" : "sucesso",
      mensagem: mensagemErro ?? `Arquivo ${file.name} importado com ${registros} registro(s).`,
      registros,
    });

    notificarCentralArquivos();
    return {
      ok: !mensagemErro,
      duplicado: false,
      mensagem: mensagemErro ?? "Sincronização concluída com sucesso.",
      arquivo: data as ArquivoImportado,
    };
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Não foi possível processar o arquivo.";
    try {
      await registrarHistorico({ dashboard, resultado: "erro", mensagem });
    } catch {
      /* histórico é secundário */
    }
    notificarCentralArquivos();
    return { ok: false, duplicado: false, mensagem: "Não foi possível processar o arquivo." };
  }
}

export async function listarArquivosImportados(): Promise<ArquivoImportado[]> {
  const { data, error } = await supabase
    .from("arquivos_importados")
    .select("*")
    .order("importado_em", { ascending: false });
  if (error) return [];
  return (data ?? []) as ArquivoImportado[];
}

export async function listarHistorico(arquivoId: string): Promise<HistoricoSincronizacao[]> {
  const { data } = await supabase
    .from("arquivos_sincronizacoes")
    .select("*")
    .eq("arquivo_id", arquivoId)
    .order("created_at", { ascending: false });
  return (data ?? []) as HistoricoSincronizacao[];
}

export async function obterConfiguracoes(): Promise<Record<DashboardDestino, boolean>> {
  const base: Record<DashboardDestino, boolean> = {
    CONTROL: false,
    FALTAS: false,
    ATESTADOS: false,
  };
  const { data } = await supabase
    .from("dashboards_config")
    .select("dashboard, sincronizacao_automatica");
  for (const linha of data ?? []) {
    base[linha.dashboard as DashboardDestino] = linha.sincronizacao_automatica;
  }
  return base;
}

export async function definirSincronizacaoAutomatica(
  dashboard: DashboardDestino,
  ativo: boolean,
): Promise<boolean> {
  const { error } = await supabase
    .from("dashboards_config")
    .upsert({ dashboard, sincronizacao_automatica: ativo }, { onConflict: "dashboard" });
  if (!error) notificarCentralArquivos();
  return !error;
}

export async function sincronizacaoAutomaticaAtiva(dashboard: DashboardDestino): Promise<boolean> {
  const config = await obterConfiguracoes();
  return config[dashboard];
}

/** Reprocessa (marca como sincronizados) os arquivos válidos do dashboard. */
export async function sincronizarDashboard(dashboard: DashboardDestino): Promise<{
  ok: boolean;
  mensagem: string;
}> {
  const arquivos = await listarArquivosImportados();
  const doDashboard = arquivos.filter((a) => a.dashboard === dashboard);

  if (doDashboard.length === 0) {
    await registrarHistorico({
      dashboard,
      resultado: "sem_alteracao",
      mensagem: "Nenhum arquivo importado para sincronizar.",
    });
    notificarCentralArquivos();
    return { ok: true, mensagem: "Nenhum arquivo importado para este dashboard." };
  }

  const pendentes = doDashboard.filter(
    (a) => a.status_sincronizacao !== "atualizado" && a.status_processamento !== "erro",
  );

  if (pendentes.length === 0) {
    await registrarHistorico({
      dashboard,
      resultado: "sem_alteracao",
      mensagem: "O dashboard já está atualizado.",
      registros: doDashboard.reduce((s, a) => s + a.registros, 0),
    });
    notificarCentralArquivos();
    return { ok: true, mensagem: "O dashboard já está atualizado." };
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("arquivos_importados")
    .update({
      status_processamento: "processado",
      status_sincronizacao: "atualizado",
      ultima_sincronizacao: agora,
      mensagem_erro: null,
    })
    .in(
      "id",
      pendentes.map((a) => a.id),
    );

  if (error) {
    await registrarHistorico({ dashboard, resultado: "erro", mensagem: error.message });
    notificarCentralArquivos();
    return { ok: false, mensagem: "Não foi possível processar o arquivo." };
  }

  const registros = pendentes.reduce((s, a) => s + a.registros, 0);
  await registrarHistorico({
    dashboard,
    resultado: "sucesso",
    mensagem: `${pendentes.length} arquivo(s) sincronizado(s).`,
    registros,
  });
  notificarCentralArquivos();
  return { ok: true, mensagem: "Sincronização concluída com sucesso." };
}

export async function sincronizarArquivo(
  arquivo: ArquivoImportado,
): Promise<{ ok: boolean; mensagem: string }> {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("arquivos_importados")
    .update({
      status_processamento: "processado",
      status_sincronizacao: "atualizado",
      ultima_sincronizacao: agora,
      mensagem_erro: null,
    })
    .eq("id", arquivo.id);

  await registrarHistorico({
    arquivo_id: arquivo.id,
    dashboard: arquivo.dashboard,
    resultado: error ? "erro" : "sucesso",
    mensagem: error ? error.message : `Arquivo ${arquivo.nome_original} sincronizado novamente.`,
    registros: arquivo.registros,
  });

  notificarCentralArquivos();
  return error
    ? { ok: false, mensagem: "Não foi possível processar o arquivo." }
    : { ok: true, mensagem: "Sincronização concluída com sucesso." };
}

export async function excluirArquivoImportado(arquivo: ArquivoImportado): Promise<boolean> {
  await supabase.storage.from(arquivo.storage_bucket).remove([arquivo.storage_path]);
  const { error } = await supabase.from("arquivos_importados").delete().eq("id", arquivo.id);
  notificarCentralArquivos();
  return !error;
}

export async function urlAssinada(arquivo: ArquivoImportado): Promise<string | null> {
  const { data } = await supabase.storage
    .from(arquivo.storage_bucket)
    .createSignedUrl(arquivo.storage_path, 60 * 10);
  return data?.signedUrl ?? null;
}

export function montarResumos(
  arquivos: ArquivoImportado[],
  config: Record<DashboardDestino, boolean>,
): Record<DashboardDestino, ResumoDashboard> {
  const dashboards: DashboardDestino[] = ["CONTROL", "FALTAS", "ATESTADOS"];
  const resultado = {} as Record<DashboardDestino, ResumoDashboard>;

  for (const dashboard of dashboards) {
    const doDash = arquivos
      .filter((a) => a.dashboard === dashboard)
      .sort((a, b) => b.importado_em.localeCompare(a.importado_em));
    const ultimo = doDash[0];

    let status: StatusSincronizacao = "aguardando";
    if (doDash.length > 0) {
      if (doDash.some((a) => a.status_sincronizacao === "erro")) status = "erro";
      else if (doDash.some((a) => a.status_sincronizacao === "processando")) status = "processando";
      else if (doDash.every((a) => a.status_sincronizacao === "atualizado")) status = "atualizado";
    }

    const sincronizacoes = doDash
      .map((a) => a.ultima_sincronizacao)
      .filter((v): v is string => !!v)
      .sort((a, b) => b.localeCompare(a));

    resultado[dashboard] = {
      dashboard,
      totalArquivos: doDash.length,
      totalRegistros: doDash.reduce((s, a) => s + a.registros, 0),
      ultimoArquivo: ultimo?.nome_original ?? null,
      ultimaImportacao: ultimo?.importado_em ?? null,
      ultimaSincronizacao: sincronizacoes[0] ?? null,
      status,
      sincronizacaoAutomatica: config[dashboard],
    };
  }

  return resultado;
}

export function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatarTamanho(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
