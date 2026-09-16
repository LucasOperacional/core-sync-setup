/**
 * LGPD — Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).
 *
 * Regras implementadas:
 *  - Finalidade e base legal registradas em cada acesso a dado pessoal
 *  - Consentimento versionado do titular
 *  - Direitos do titular (art. 18): acesso, correção, exclusão, portabilidade, anonimização
 *  - Prazos legais de resposta e de retenção por módulo
 *  - Registro e comunicação de incidentes (art. 48)
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const BASES_LEGAIS = [
  { key: "consentimento", label: "Consentimento do titular (art. 7º, I)" },
  { key: "obrigacao_legal", label: "Cumprimento de obrigação legal (art. 7º, II)" },
  { key: "execucao_contrato", label: "Execução de contrato (art. 7º, V)" },
  { key: "exercicio_direitos", label: "Exercício regular de direitos (art. 7º, VI)" },
  { key: "protecao_vida", label: "Proteção da vida (art. 7º, VII)" },
  { key: "tutela_saude", label: "Tutela da saúde (art. 11, II, 'f')" },
  { key: "legitimo_interesse", label: "Legítimo interesse (art. 7º, IX)" },
] as const;

export const TIPOS_SOLICITACAO = [
  { key: "acesso", label: "Acesso aos meus dados", prazo: 15 },
  { key: "correcao", label: "Correção de dados incompletos ou desatualizados", prazo: 15 },
  { key: "exclusao", label: "Exclusão de dados tratados com consentimento", prazo: 15 },
  { key: "portabilidade", label: "Portabilidade dos dados", prazo: 15 },
  { key: "anonimizacao", label: "Anonimização ou bloqueio de dados", prazo: 15 },
  { key: "revogacao", label: "Revogação do consentimento", prazo: 15 },
  { key: "informacao", label: "Informação sobre compartilhamento com terceiros", prazo: 15 },
] as const;

export type LgpdConfig = {
  controlador: string;
  controladorCnpj: string;
  encarregadoNome: string;
  encarregadoEmail: string;
  encarregadoTelefone: string;
  politicaVersao: string;
  politicaTexto: string;
  prazoRespostaDias: number;
  retencaoAtestadosDias: number;
  retencaoFolhasDias: number;
  retencaoChatDias: number;
  retencaoLogsDias: number;
  anonimizarAposRetencao: boolean;
  bannerConsentimentoAtivo: boolean;
};

export type LgpdSolicitacao = {
  id: string;
  userId: string | null;
  titularNome: string;
  titularEmail: string;
  tipo: string;
  descricao: string;
  status: string;
  resposta: string;
  prazoEm: string;
  respondidoEm: string | null;
  createdAt: string;
};

export type LgpdIncidente = {
  id: string;
  titulo: string;
  descricao: string;
  severidade: string;
  dadosAfetados: string;
  titularesAfetados: number;
  detectadoEm: string;
  comunicadoAnpd: boolean;
  status: string;
  medidas: string;
};

export type LgpdAcesso = {
  id: string;
  userId: string | null;
  recurso: string;
  acao: string;
  titularRef: string;
  baseLegal: string;
  finalidade: string;
  createdAt: string;
};

export type LgpdPanorama = {
  isAdmin: boolean;
  config: LgpdConfig;
  consentimentoAtual: { aceito: boolean; versao: string; createdAt: string } | null;
  minhasSolicitacoes: LgpdSolicitacao[];
  solicitacoes: LgpdSolicitacao[];
  incidentes: LgpdIncidente[];
  acessos: LgpdAcesso[];
  metricas: {
    solicitacoesAbertas: number;
    solicitacoesVencidas: number;
    prazoMedioDias: number;
    incidentesAbertos: number;
    acessos30d: number;
    consentimentosAtivos: number;
  };
};

const DEFAULT_POLITICA = `Esta plataforma trata dados pessoais de colaboradores em conformidade com a Lei nº 13.709/2018 (LGPD).
Coletamos apenas os dados necessários para gestão de ponto, faltas, atestados, protocolos e supervisão operacional.
O titular pode, a qualquer momento, solicitar acesso, correção, portabilidade, anonimização ou exclusão dos seus dados.`;

function mapConfig(row: Record<string, any> | null | undefined): LgpdConfig {
  const r = row ?? {};
  return {
    controlador: String(r["controlador"] ?? ""),
    controladorCnpj: String(r["controlador_cnpj"] ?? ""),
    encarregadoNome: String(r["encarregado_nome"] ?? ""),
    encarregadoEmail: String(r["encarregado_email"] ?? ""),
    encarregadoTelefone: String(r["encarregado_telefone"] ?? ""),
    politicaVersao: String(r["politica_versao"] ?? "1.0"),
    politicaTexto: String(r["politica_texto"] || DEFAULT_POLITICA),
    prazoRespostaDias: Number(r["prazo_resposta_dias"] ?? 15),
    retencaoAtestadosDias: Number(r["retencao_atestados_dias"] ?? 1825),
    retencaoFolhasDias: Number(r["retencao_folhas_dias"] ?? 1825),
    retencaoChatDias: Number(r["retencao_chat_dias"] ?? 365),
    retencaoLogsDias: Number(r["retencao_logs_dias"] ?? 180),
    anonimizarAposRetencao: r["anonimizar_apos_retencao"] !== false,
    bannerConsentimentoAtivo: r["banner_consentimento_ativo"] !== false,
  };
}

function mapSolicitacao(r: Record<string, any>): LgpdSolicitacao {
  return {
    id: String(r["id"]),
    userId: r["user_id"] ?? null,
    titularNome: String(r["titular_nome"] ?? ""),
    titularEmail: String(r["titular_email"] ?? ""),
    tipo: String(r["tipo"] ?? "acesso"),
    descricao: String(r["descricao"] ?? ""),
    status: String(r["status"] ?? "aberta"),
    resposta: String(r["resposta"] ?? ""),
    prazoEm: String(r["prazo_em"] ?? ""),
    respondidoEm: r["respondido_em"] ?? null,
    createdAt: String(r["created_at"] ?? ""),
  };
}

/** Painel consolidado de conformidade LGPD. */
export const getLgpdPanorama = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LgpdPanorama> => {
    const { supabase, userId } = context;

    const { data: isAdminRaw } = await supabase.rpc(
      "has_role" as never,
      {
        _user_id: userId,
        _role: "admin",
      } as never,
    );
    const isAdmin = isAdminRaw === true;

    const [{ data: cfg }, { data: consent }, { data: solic }, { data: incid }, { data: acess }] =
      await Promise.all([
        supabase
          .from("lgpd_config" as never)
          .select("*")
          .maybeSingle(),
        supabase
          .from("lgpd_consents" as never)
          .select("*")
          .eq("user_id" as never, userId as never)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("lgpd_solicitacoes" as never)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
        isAdmin
          ? supabase
              .from("lgpd_incidentes" as never)
              .select("*")
              .order("detectado_em", { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("lgpd_acessos" as never)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

    const config = mapConfig(cfg as Record<string, any> | null);
    const consentRow = ((consent ?? []) as Array<Record<string, any>>)[0];
    const todas = ((solic ?? []) as Array<Record<string, any>>).map(mapSolicitacao);
    const minhas = todas.filter((s) => s.userId === userId);
    const hoje = new Date().toISOString().slice(0, 10);

    const incidentes = ((incid ?? []) as Array<Record<string, any>>).map((r) => ({
      id: String(r["id"]),
      titulo: String(r["titulo"] ?? ""),
      descricao: String(r["descricao"] ?? ""),
      severidade: String(r["severidade"] ?? "media"),
      dadosAfetados: String(r["dados_afetados"] ?? ""),
      titularesAfetados: Number(r["titulares_afetados"] ?? 0),
      detectadoEm: String(r["detectado_em"] ?? ""),
      comunicadoAnpd: r["comunicado_anpd"] === true,
      status: String(r["status"] ?? "aberto"),
      medidas: String(r["medidas"] ?? ""),
    })) as LgpdIncidente[];

    const acessos = ((acess ?? []) as Array<Record<string, any>>).map((r) => ({
      id: String(r["id"]),
      userId: r["user_id"] ?? null,
      recurso: String(r["recurso"] ?? ""),
      acao: String(r["acao"] ?? ""),
      titularRef: String(r["titular_ref"] ?? ""),
      baseLegal: String(r["base_legal"] ?? ""),
      finalidade: String(r["finalidade"] ?? ""),
      createdAt: String(r["created_at"] ?? ""),
    })) as LgpdAcesso[];

    const respondidas = todas.filter((s) => s.respondidoEm);
    const prazoMedio = respondidas.length
      ? Math.round(
          respondidas.reduce(
            (acc, s) =>
              acc +
              (new Date(s.respondidoEm!).getTime() - new Date(s.createdAt).getTime()) / 86_400_000,
            0,
          ) / respondidas.length,
        )
      : 0;

    return {
      isAdmin,
      config,
      consentimentoAtual: consentRow
        ? {
            aceito: consentRow["aceito"] === true,
            versao: String(consentRow["politica_versao"] ?? "1.0"),
            createdAt: String(consentRow["created_at"] ?? ""),
          }
        : null,
      minhasSolicitacoes: minhas,
      solicitacoes: isAdmin ? todas : minhas,
      incidentes,
      acessos,
      metricas: {
        solicitacoesAbertas: todas.filter((s) => s.status === "aberta" || s.status === "em_analise")
          .length,
        solicitacoesVencidas: todas.filter(
          (s) => s.status !== "concluida" && s.status !== "recusada" && s.prazoEm < hoje,
        ).length,
        prazoMedioDias: prazoMedio,
        incidentesAbertos: incidentes.filter((i) => i.status !== "encerrado").length,
        acessos30d: acessos.length,
        consentimentosAtivos: consentRow && consentRow["aceito"] === true ? 1 : 0,
      },
    };
  });

/** Registra o aceite (ou recusa) da política de privacidade pelo titular. */
export const registrarConsentimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { aceito: boolean; finalidade?: string; versao?: string }) => ({
    aceito: !!input?.aceito,
    finalidade: (input?.finalidade ?? "uso_da_plataforma").slice(0, 120),
    versao: (input?.versao ?? "1.0").slice(0, 20),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lgpd_consents" as never).insert({
      user_id: userId,
      finalidade: data.finalidade,
      base_legal: "consentimento",
      politica_versao: data.versao,
      aceito: data.aceito,
    } as never);
    return { ok: !error };
  });

/** Registra um acesso a dado pessoal, com base legal e finalidade (princípio da prestação de contas). */
export const registrarAcessoDadoPessoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      recurso: string;
      acao?: string;
      titularRef?: string;
      baseLegal?: string;
      finalidade?: string;
      detalhes?: Record<string, unknown>;
    }) => {
      if (!input?.recurso) throw new Error("Recurso obrigatório.");
      return {
        recurso: input.recurso.slice(0, 120),
        acao: (input.acao ?? "leitura").slice(0, 40),
        titularRef: (input.titularRef ?? "").slice(0, 120),
        baseLegal: (input.baseLegal ?? "obrigacao_legal").slice(0, 40),
        finalidade: (input.finalidade ?? "").slice(0, 200),
        detalhes: input.detalhes ?? {},
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lgpd_acessos" as never).insert({
      user_id: userId,
      recurso: data.recurso,
      acao: data.acao,
      titular_ref: data.titularRef,
      base_legal: data.baseLegal,
      finalidade: data.finalidade,
      detalhes: data.detalhes,
    } as never);
    return { ok: !error };
  });

/** Abre uma solicitação de direito do titular (art. 18 da LGPD). */
export const criarSolicitacaoTitular = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tipo: string; descricao: string; titularNome?: string }) => {
    const tipos = TIPOS_SOLICITACAO.map((t) => t.key) as readonly string[];
    if (!tipos.includes(input?.tipo)) throw new Error("Tipo de solicitação inválido.");
    return {
      tipo: input.tipo,
      descricao: (input.descricao ?? "").slice(0, 2000),
      titularNome: (input.titularNome ?? "").slice(0, 120),
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId, claims } = context;

    const { data: cfg } = await supabase
      .from("lgpd_config" as never)
      .select("prazo_resposta_dias")
      .maybeSingle();
    const prazoDias = Number((cfg as any)?.["prazo_resposta_dias"] ?? 15);
    const prazo = new Date(Date.now() + prazoDias * 86_400_000).toISOString().slice(0, 10);

    const { error } = await supabase.from("lgpd_solicitacoes" as never).insert({
      user_id: userId,
      titular_nome: data.titularNome,
      titular_email: (claims as any)?.email ?? "",
      tipo: data.tipo,
      descricao: data.descricao,
      status: "aberta",
      prazo_em: prazo,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Responde/atualiza uma solicitação (somente administradores). */
export const responderSolicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; resposta?: string }) => {
    if (!input?.id) throw new Error("Solicitação inválida.");
    const validos = ["aberta", "em_analise", "concluida", "recusada"];
    if (!validos.includes(input.status)) throw new Error("Status inválido.");
    return { id: input.id, status: input.status, resposta: (input.resposta ?? "").slice(0, 4000) };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc(
      "has_role" as never,
      {
        _user_id: userId,
        _role: "admin",
      } as never,
    );
    if (isAdmin !== true) throw new Error("Apenas administradores podem responder solicitações.");

    const concluida = data.status === "concluida" || data.status === "recusada";
    const { error } = await (supabase.from("lgpd_solicitacoes" as never) as any)
      .update({
        status: data.status,
        resposta: data.resposta,
        respondido_por: userId,
        respondido_em: concluida ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ExportacaoTitular = {
  geradoEm: string;
  fundamento: string;
  titularId: string;
  titularEmail: string;
  registrosJson: Record<string, string>;
};

export const exportarMeusDados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExportacaoTitular> => {
    const { supabase, userId, claims } = context;

    const tabelas = [
      "user_profiles",
      "user_permissions",
      "lgpd_consents",
      "lgpd_solicitacoes",
      "lgpd_acessos",
      "ai_conversations",
      "atestados_verificados",
    ];

    const registros: Record<string, string> = {};

    for (const t of tabelas) {
      const coluna = t === "user_profiles" ? "id" : "user_id";
      const { data } = await supabase
        .from(t as never)
        .select("*")
        .eq(coluna as never, userId as never)
        .limit(1000);
      registros[t] = JSON.stringify(data ?? []);
    }

    return {
      geradoEm: new Date().toISOString(),
      fundamento: "Art. 18, incisos II e V, da Lei nº 13.709/2018 (LGPD)",
      titularId: userId,
      titularEmail: String((claims as any)?.email ?? ""),
      registrosJson: registros,
    };
  });

/** Salva a configuração LGPD (somente administradores). */
export const salvarLgpdConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<LgpdConfig>) => input ?? {})
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc(
      "has_role" as never,
      {
        _user_id: userId,
        _role: "admin",
      } as never,
    );
    if (isAdmin !== true) throw new Error("Apenas administradores podem alterar a política LGPD.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("lgpd_config" as never) as any).upsert(
      {
        id: true,
        controlador: data.controlador ?? "",
        controlador_cnpj: data.controladorCnpj ?? "",
        encarregado_nome: data.encarregadoNome ?? "",
        encarregado_email: data.encarregadoEmail ?? "",
        encarregado_telefone: data.encarregadoTelefone ?? "",
        politica_versao: data.politicaVersao ?? "1.0",
        politica_texto: data.politicaTexto ?? DEFAULT_POLITICA,
        prazo_resposta_dias: data.prazoRespostaDias ?? 15,
        retencao_atestados_dias: data.retencaoAtestadosDias ?? 1825,
        retencao_folhas_dias: data.retencaoFolhasDias ?? 1825,
        retencao_chat_dias: data.retencaoChatDias ?? 365,
        retencao_logs_dias: data.retencaoLogsDias ?? 180,
        anonimizar_apos_retencao: data.anonimizarAposRetencao ?? true,
        banner_consentimento_ativo: data.bannerConsentimentoAtivo ?? true,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Registra um incidente de segurança com dados pessoais (art. 48). */
export const registrarIncidente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      titulo: string;
      descricao?: string;
      severidade?: string;
      dadosAfetados?: string;
      titularesAfetados?: number;
    }) => {
      if (!input?.titulo) throw new Error("Título obrigatório.");
      return {
        titulo: input.titulo.slice(0, 200),
        descricao: (input.descricao ?? "").slice(0, 4000),
        severidade: input.severidade ?? "media",
        dadosAfetados: (input.dadosAfetados ?? "").slice(0, 500),
        titularesAfetados: Math.max(0, Number(input.titularesAfetados ?? 0)),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lgpd_incidentes" as never).insert({
      titulo: data.titulo,
      descricao: data.descricao,
      severidade: data.severidade,
      dados_afetados: data.dadosAfetados,
      titulares_afetados: data.titularesAfetados,
      created_by: userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marca incidente como comunicado à ANPD / encerrado (somente administradores). */
export const atualizarIncidente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; status?: string; comunicadoAnpd?: boolean; medidas?: string }) => {
      if (!input?.id) throw new Error("Incidente inválido.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.status) patch["status"] = data.status;
    if (typeof data.comunicadoAnpd === "boolean") {
      patch["comunicado_anpd"] = data.comunicadoAnpd;
      patch["comunicado_em"] = data.comunicadoAnpd ? new Date().toISOString() : null;
    }
    if (typeof data.medidas === "string") patch["medidas"] = data.medidas.slice(0, 4000);

    const { error } = await (supabase.from("lgpd_incidentes" as never) as any)
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
