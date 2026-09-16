/**
 * Guarda de servidor — aplica limite de chamadas dentro das server functions.
 * Usado por operações sensíveis (integrações externas, administração de usuários)
 * para impedir abuso, força-bruta e rajadas tipo DDoS mesmo se o cliente for burlado.
 */

export type ServerGuardContext = {
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

/**
 * Lança erro claro quando o usuário excede o limite do recurso.
 * Falhas do próprio escudo não bloqueiam a operação.
 */
export async function enforceRateLimit(
  context: ServerGuardContext,
  resource: string,
  limit = 30,
  windowSeconds = 60,
): Promise<void> {
  try {
    // O controle de limite roda apenas no servidor (cliente privilegiado):
    // usuários conectados não podem acionar a verificação diretamente.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as ServerGuardContext["supabase"]).rpc(
      "security_check_rate_limit",
      {
        _identity: `user:${context.userId}`,
        _resource: resource,
        _limit: limit,
        _window_seconds: windowSeconds,
      },
    );
    if (error) return;
    const r = (data ?? {}) as Record<string, unknown>;
    if (r["allowed"] === false) {
      const retry = Number(r["retry_after_seconds"] ?? windowSeconds);
      throw new Error(
        `Bloqueado pelo escudo de segurança: muitas chamadas em "${resource}". Tente novamente em ${retry}s.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Bloqueado pelo escudo")) throw err;
    // escudo indisponível — não interromper a operação legítima
  }
}
