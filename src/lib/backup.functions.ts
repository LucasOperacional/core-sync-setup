import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, SUPERADMIN_EMAILS } from "@/lib/usuarios-guard.server";

export type StatusVerificacao = "ok" | "corrigido" | "aviso";

export type ItemVerificacao = {
  titulo: string;
  status: StatusVerificacao;
  detalhe: string;
};

export type TabelaInventario = { nome: string; registros: number };
export type BucketInventario = { nome: string; arquivos: number; bytes: number };

export type InventarioBackup = {
  geradoEm: string;
  tabelas: TabelaInventario[];
  buckets: BucketInventario[];
  totalRegistros: number;
};

export type ArquivoBackup = {
  bucket: string;
  caminho: string;
  bytes: number;
  url: string;
};

const LIMITE_PAGINA = 1000;

/** Campos cujo valor nunca é gravado em claro no backup. */
const CAMPOS_SENSIVEIS =
  /(senha|password|secret|token|api_key|apikey|chave_api|authorization|private_key)/i;

function mascarar(linha: Record<string, any>): Record<string, any> {
  const saida: Record<string, any> = { ...linha };
  for (const chave of Object.keys(saida)) {
    if (CAMPOS_SENSIVEIS.test(chave) && saida[chave]) {
      const valor = String(saida[chave]);
      saida[chave] = `***protegido*** (${valor.length} caracteres)`;
    }
  }
  return saida;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function listarTabelas(db: any): Promise<string[]> {
  const { data, error } = await db.rpc("backup_listar_tabelas");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l: { nome: string }) => l.nome);
}

async function listarArquivosRecursivo(
  db: any,
  bucket: string,
  prefixo = "",
): Promise<{ caminho: string; bytes: number }[]> {
  const saida: { caminho: string; bytes: number }[] = [];
  const { data, error } = await db.storage.from(bucket).list(prefixo, { limit: 1000 });
  if (error || !data) return saida;
  for (const item of data as any[]) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.id === null || item.metadata === null) {
      saida.push(...(await listarArquivosRecursivo(db, bucket, caminho)));
    } else {
      saida.push({ caminho, bytes: Number(item.metadata?.size ?? 0) });
    }
  }
  return saida;
}

/**
 * Verifica a integridade dos dados antes do backup.
 * Corrige automaticamente o que é seguro e reporta o restante.
 */
export const verificarIntegridadeBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ itens: ItemVerificacao[] }> => {
    await assertAdmin(context as any);
    const db = await admin();
    const itens: ItemVerificacao[] = [];

    // 1) Todas as tabelas precisam estar legíveis.
    const tabelas = await listarTabelas(db);
    const ilegiveis: string[] = [];
    for (const nome of tabelas) {
      const { error } = await db.from(nome).select("*", { count: "exact", head: true });
      if (error) ilegiveis.push(`${nome} (${error.message})`);
    }
    itens.push(
      ilegiveis.length === 0
        ? {
            titulo: "Leitura dos dados",
            status: "ok",
            detalhe: `${tabelas.length} conjuntos de dados legíveis.`,
          }
        : {
            titulo: "Leitura dos dados",
            status: "aviso",
            detalhe: `Não foi possível ler: ${ilegiveis.join(", ")}`,
          },
    );

    // 2) Perfis faltando para contas existentes (correção segura).
    const { data: usuarios } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const contas = (usuarios?.users ?? []) as any[];
    const { data: perfis } = await db.from("user_profiles").select("id");
    const idsComPerfil = new Set((perfis ?? []).map((p: any) => p.id));
    const semPerfil = contas.filter((u) => !idsComPerfil.has(u.id));
    if (semPerfil.length > 0) {
      const novos = semPerfil.map((u) => ({
        id: u.id,
        display_name:
          u.user_metadata?.nome ??
          u.user_metadata?.full_name ??
          String(u.email ?? "Usuário").split("@")[0],
      }));
      const { error } = await db.from("user_profiles").upsert(novos, { onConflict: "id" });
      itens.push({
        titulo: "Perfis de usuários",
        status: error ? "aviso" : "corrigido",
        detalhe: error
          ? `${semPerfil.length} contas sem perfil e não foi possível criar: ${error.message}`
          : `${semPerfil.length} perfis criados automaticamente.`,
      });
    } else {
      itens.push({
        titulo: "Perfis de usuários",
        status: "ok",
        detalhe: `${contas.length} contas com perfil completo.`,
      });
    }

    // 3) Superadministrador precisa manter o acesso total (correção segura).
    const supers = contas.filter((u) =>
      SUPERADMIN_EMAILS.includes(String(u.email ?? "").toLowerCase()),
    );
    let corrigidosPapel = 0;
    for (const u of supers) {
      const { data } = await db
        .from("user_roles")
        .select("id")
        .eq("user_id", u.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!data) {
        const { error } = await db.from("user_roles").insert({ user_id: u.id, role: "admin" });
        if (!error) corrigidosPapel += 1;
      }
    }
    itens.push({
      titulo: "Acesso do superadministrador",
      status: corrigidosPapel > 0 ? "corrigido" : supers.length > 0 ? "ok" : "aviso",
      detalhe:
        supers.length === 0
          ? "Nenhuma conta de superadministrador encontrada."
          : corrigidosPapel > 0
            ? `Permissão de administrador restaurada em ${corrigidosPapel} conta(s).`
            : "Permissões em ordem.",
    });

    // 4) Permissões duplicadas (correção segura).
    const { data: permissoes } = await db.from("user_permissions").select("*");
    const vistos = new Set<string>();
    const duplicadas: string[] = [];
    for (const p of (permissoes ?? []) as any[]) {
      const chave = `${p.user_id}|${p.page_key ?? p.pagina ?? ""}`;
      if (vistos.has(chave)) duplicadas.push(p.id);
      else vistos.add(chave);
    }
    if (duplicadas.length > 0) {
      const { error } = await db.from("user_permissions").delete().in("id", duplicadas);
      itens.push({
        titulo: "Permissões duplicadas",
        status: error ? "aviso" : "corrigido",
        detalhe: error
          ? `${duplicadas.length} duplicidades encontradas: ${error.message}`
          : `${duplicadas.length} permissões repetidas removidas.`,
      });
    } else {
      itens.push({
        titulo: "Permissões duplicadas",
        status: "ok",
        detalhe: "Nenhuma permissão repetida.",
      });
    }

    // 5) Contas sem nenhum papel (só aviso — depende de decisão do gestor).
    const { data: papeis } = await db.from("user_roles").select("user_id");
    const comPapel = new Set((papeis ?? []).map((r: any) => r.user_id));
    const semPapel = contas.filter((u) => !comPapel.has(u.id)).map((u) => u.email);
    itens.push({
      titulo: "Contas sem perfil de acesso",
      status: semPapel.length > 0 ? "aviso" : "ok",
      detalhe:
        semPapel.length > 0
          ? `Precisam de definição manual: ${semPapel.slice(0, 10).join(", ")}${semPapel.length > 10 ? "…" : ""}`
          : "Todas as contas têm perfil de acesso definido.",
    });

    return { itens };
  });

/** Monta o inventário do que será salvo (tabelas, registros e arquivos). */
export const listarInventarioBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InventarioBackup> => {
    await assertAdmin(context as any);
    const db = await admin();
    const nomes = await listarTabelas(db);

    const tabelas: TabelaInventario[] = [];
    for (const nome of nomes) {
      const { count, error } = await db.from(nome).select("*", { count: "exact", head: true });
      if (!error) tabelas.push({ nome, registros: Number(count ?? 0) });
    }

    const { data: buckets } = await db.storage.listBuckets();
    const inventarioBuckets: BucketInventario[] = [];
    for (const b of (buckets ?? []) as any[]) {
      const arquivos = await listarArquivosRecursivo(db, b.name);
      inventarioBuckets.push({
        nome: b.name,
        arquivos: arquivos.length,
        bytes: arquivos.reduce((s, a) => s + a.bytes, 0),
      });
    }

    return {
      geradoEm: new Date().toISOString(),
      tabelas,
      buckets: inventarioBuckets,
      totalRegistros: tabelas.reduce((s, t) => s + t.registros, 0),
    };
  });

/** Exporta uma página de registros de um conjunto de dados. */
export const exportarTabelaBackup = createServerFn({ method: "POST" })
  .inputValidator((data: { nome: string; pagina: number }) => ({
    nome: String(data?.nome ?? ""),
    pagina: Math.max(0, Number(data?.pagina ?? 0)),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const db = await admin();
    const nomes = await listarTabelas(db);
    if (!nomes.includes(data.nome)) throw new Error("Conjunto de dados inválido.");

    const inicio = data.pagina * LIMITE_PAGINA;
    const { data: linhas, error } = await db
      .from(data.nome)
      .select("*")
      .range(inicio, inicio + LIMITE_PAGINA - 1);
    if (error) throw new Error(error.message);

    const registros = ((linhas ?? []) as Record<string, any>[]).map(mascarar);
    return { registros, fim: registros.length < LIMITE_PAGINA };
  });

/** Reúne configurações, integrações ativas, usuários e permissões. */
export const exportarConfiguracoesBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const db = await admin();

    const { data: config } = await db.from("app_config").select("*");
    const { data: usuarios } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const { data: papeis } = await db.from("user_roles").select("*");
    const { data: permissoes } = await db.from("user_permissions").select("*");
    const { data: buckets } = await db.storage.listBuckets();

    const integracoes = Object.keys(process.env ?? {})
      .filter((k) => /KEY|TOKEN|SECRET|URL|API/i.test(k))
      .sort()
      .map((nome) => ({ nome, configurado: true }));

    return {
      geradoEm: new Date().toISOString(),
      configuracoes: ((config ?? []) as Record<string, any>[]).map(mascarar),
      integracoes,
      pastasArquivos: ((buckets ?? []) as any[]).map((b) => ({
        nome: b.name,
        publico: b.public,
      })),
      usuarios: ((usuarios?.users ?? []) as any[]).map((u) => ({
        id: u.id,
        email: u.email,
        criado_em: u.created_at,
        ultimo_acesso: u.last_sign_in_at,
        confirmado_em: u.email_confirmed_at,
        metadados: u.user_metadata ?? {},
      })),
      papeis: papeis ?? [],
      permissoes: permissoes ?? [],
    };
  });

/** Gera links temporários para baixar os arquivos de uma pasta. */
export const listarArquivosBackup = createServerFn({ method: "POST" })
  .inputValidator((data: { bucket: string }) => ({ bucket: String(data?.bucket ?? "") }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ArquivoBackup[]> => {
    await assertAdmin(context as any);
    const db = await admin();

    const { data: buckets } = await db.storage.listBuckets();
    if (!((buckets ?? []) as any[]).some((b) => b.name === data.bucket)) {
      throw new Error("Pasta de arquivos inválida.");
    }

    const arquivos = await listarArquivosRecursivo(db, data.bucket);
    const saida: ArquivoBackup[] = [];
    for (let i = 0; i < arquivos.length; i += 100) {
      const lote = arquivos.slice(i, i + 100);
      const { data: urls } = await db.storage
        .from(data.bucket)
        .createSignedUrls(
          lote.map((a) => a.caminho),
          60 * 60,
        );
      for (const item of (urls ?? []) as any[]) {
        const encontrado = lote.find((a) => a.caminho === item.path);
        if (item.signedUrl) {
          saida.push({
            bucket: data.bucket,
            caminho: item.path,
            bytes: encontrado?.bytes ?? 0,
            url: item.signedUrl,
          });
        }
      }
    }
    return saida;
  });
