/** Catálogo dos eventos do sistema que geram notificação no celular.
 * Use estas funções nos pontos do sistema — nunca dentro de laços sem controle:
 * para eventos em massa, agrupe e envie um único aviso de resumo.
 */

import type { CategoriaPush } from "./push-tipos";
import { enviarNotificacaoPush } from "./push.functions";

type Opcoes = {
  /** Quem recebe. Vazio = a própria pessoa que está usando o sistema. */
  destinatarios?: string[];
  contexto?: Record<string, unknown>;
  rota?: string;
  chaveUnica?: string;
};

/** Dispara um aviso sem nunca interromper a tela em caso de falha. */
export async function notificarEvento(
  category: CategoriaPush,
  event: string,
  opcoes: Opcoes = {},
): Promise<void> {
  try {
    await enviarNotificacaoPush({
      data: {
        category,
        event,
        recipientUserIds: opcoes.destinatarios ?? null,
        context: opcoes.contexto ?? null,
        targetUrl: opcoes.rota ?? null,
        deduplicationKey: opcoes.chaveUnica ?? null,
      },
    });
  } catch {
    /* notificação é complementar: falha nunca interrompe a operação */
  }
}

/* ─── Protocolos ─── */
export const pushProtocolos = {
  aprovadoAutomaticamente: (id: string, ctx: Record<string, unknown>, quem?: string[]) =>
    notificarEvento("protocolos", "protocolo_aprovado", {
      contexto: ctx,
      rota: "/protocolo-folhas-ponto",
      chaveUnica: `protocolo:${id}:aprovado`,
      ...(quem ? { destinatarios: quem } : {}),
    }),
  reprovado: (id: string, ctx: Record<string, unknown>, quem?: string[]) =>
    notificarEvento("protocolos", "protocolo_reprovado", {
      contexto: ctx,
      rota: "/protocolo-folhas-ponto",
      chaveUnica: `protocolo:${id}:reprovado`,
      ...(quem ? { destinatarios: quem } : {}),
    }),
  requerAnaliseManual: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("protocolos", "protocolo_analise_manual", {
      contexto: ctx,
      rota: "/protocolo-folhas-ponto",
      chaveUnica: `protocolo:${id}:analise_manual`,
    }),
  folhaProtocolada: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("protocolos", "folha_ponto_protocolada", {
      contexto: ctx,
      rota: "/protocolo-folhas-ponto",
      chaveUnica: `protocolo:${id}:protocolada`,
    }),
  documentoPendente: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("protocolos", "documento_pendente", {
      contexto: ctx,
      rota: "/protocolo-folhas-ponto",
      chaveUnica: `protocolo:${id}:pendente`,
    }),
};

/* ─── Atestados ─── */
export const pushAtestados = {
  importado: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("atestados", "atestado_importado", {
      contexto: ctx,
      rota: "/atestados",
      chaveUnica: `atestado:${id}:importado`,
    }),
  aprovado: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("atestados", "atestado_aprovado", {
      contexto: ctx,
      rota: "/atestados",
      chaveUnica: `atestado:${id}:aprovado`,
    }),
  reprovado: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("atestados", "atestado_reprovado", {
      contexto: ctx,
      rota: "/atestados",
      chaveUnica: `atestado:${id}:reprovado`,
    }),
  requerAnaliseManual: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("atestados", "atestado_analise_manual", {
      contexto: ctx,
      rota: "/verificador-atestados",
      chaveUnica: `atestado:${id}:analise_manual`,
    }),
  documentoIlegivel: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("atestados", "atestado_ilegivel", {
      contexto: ctx,
      rota: "/verificador-atestados",
      chaveUnica: `atestado:${id}:ilegivel`,
    }),
};

/* ─── Faltas e NEXTI ─── */
export const pushFaltasNexti = {
  ausenciaCadastrada: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("faltas", "ausencia_cadastrada", {
      contexto: ctx,
      rota: "/faltas",
      chaveUnica: `ausencia:${id}:cadastrada`,
    }),
  ausenciaRecusada: (id: string, ctx: Record<string, unknown>) =>
    notificarEvento("nexti", "ausencia_recusada", {
      contexto: ctx,
      rota: "/faltas",
      chaveUnica: `ausencia:${id}:recusada`,
    }),
  credenciaisInvalidas: () =>
    notificarEvento("nexti", "nexti_credenciais_invalidas", {
      rota: "/ia-operacional",
      chaveUnica: `nexti:credenciais:${new Date().toISOString().slice(0, 13)}`,
    }),
  falhaConexao: () =>
    notificarEvento("nexti", "nexti_falha_conexao", {
      rota: "/ia-operacional",
      chaveUnica: `nexti:conexao:${new Date().toISOString().slice(0, 13)}`,
    }),
  erroHttp: (codigo: number, ctx: Record<string, unknown> = {}) =>
    notificarEvento("nexti", "nexti_erro_http", {
      contexto: { ...ctx, codigo },
      rota: "/ia-operacional",
      chaveUnica: `nexti:http_${codigo}:${new Date().toISOString().slice(0, 13)}`,
    }),
  camposObrigatorios: (ctx: Record<string, unknown>) =>
    notificarEvento("nexti", "nexti_campos_obrigatorios", { contexto: ctx, rota: "/faltas" }),
  sincronizacaoConcluida: (ctx: Record<string, unknown>) =>
    notificarEvento("nexti", "nexti_sincronizacao_concluida", {
      contexto: ctx,
      rota: "/painel-nexti",
      chaveUnica: `nexti:sync:${new Date().toISOString().slice(0, 16)}`,
    }),
};

/* ─── Documentos ─── */
export const pushDocumentos = {
  aguardandoAssinatura: (id: string, ctx: Record<string, unknown>, quem?: string[]) =>
    notificarEvento("documentos", "documento_aguardando_assinatura", {
      contexto: ctx,
      rota: "/assinatura-documentos",
      chaveUnica: `documento:${id}:aguardando`,
      ...(quem ? { destinatarios: quem } : {}),
    }),
  assinado: (id: string, ctx: Record<string, unknown>, quem?: string[]) =>
    notificarEvento("documentos", "documento_assinado", {
      contexto: ctx,
      rota: "/assinatura-documentos",
      chaveUnica: `documento:${id}:assinado`,
      ...(quem ? { destinatarios: quem } : {}),
    }),
  recusado: (id: string, ctx: Record<string, unknown>, quem?: string[]) =>
    notificarEvento("documentos", "documento_recusado", {
      contexto: ctx,
      rota: "/assinatura-documentos",
      chaveUnica: `documento:${id}:recusado`,
      ...(quem ? { destinatarios: quem } : {}),
    }),
  prazoProximo: (id: string, ctx: Record<string, unknown>, quem?: string[]) =>
    notificarEvento("documentos", "documento_prazo_proximo", {
      contexto: ctx,
      rota: "/assinatura-documentos",
      chaveUnica: `documento:${id}:prazo`,
      ...(quem ? { destinatarios: quem } : {}),
    }),
};

/* ─── Chat interno ─── */
export const pushChat = {
  novaMensagem: (conversaId: string, ctx: Record<string, unknown>, quem: string[]) =>
    notificarEvento("chat", "chat_nova_mensagem", {
      destinatarios: quem,
      contexto: ctx,
      rota: "/chat-interno",
      chaveUnica: `chat:${conversaId}:${new Date().toISOString().slice(0, 16)}`,
    }),
  novoAtendimento: (id: string, ctx: Record<string, unknown>, quem: string[]) =>
    notificarEvento("chat", "chat_novo_atendimento", {
      destinatarios: quem,
      contexto: ctx,
      rota: "/chat-interno",
      chaveUnica: `atendimento:${id}:novo`,
    }),
  atribuidoAFila: (id: string, ctx: Record<string, unknown>, quem: string[]) =>
    notificarEvento("chat", "chat_atribuido_fila", {
      destinatarios: quem,
      contexto: ctx,
      rota: "/chat-interno",
      chaveUnica: `fila:${id}:atribuido`,
    }),
};

/* ─── Sistema ─── */
export const pushSistema = {
  importacaoConcluida: (ctx: Record<string, unknown>) =>
    notificarEvento("sistema", "importacao_concluida", { contexto: ctx, rota: "/admin" }),
  importacaoComErro: (ctx: Record<string, unknown>) =>
    notificarEvento("sistema", "importacao_com_erro", { contexto: ctx, rota: "/admin" }),
  falhaCritica: (ctx: Record<string, unknown>) =>
    notificarEvento("sistema", "falha_critica", { contexto: ctx, rota: "/ia-operacional" }),
  relatorioConcluido: (ctx: Record<string, unknown>) =>
    notificarEvento("sistema", "relatorio_concluido", { contexto: ctx, rota: "/indicadores" }),
  dashboardSincronizado: (ctx: Record<string, unknown>) =>
    notificarEvento("sistema", "dashboard_sincronizado", { contexto: ctx, rota: "/control" }),
};
