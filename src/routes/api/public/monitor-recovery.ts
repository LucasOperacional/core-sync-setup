import { createFileRoute } from "@tanstack/react-router";
import {
  assinaturaHmac,
  comparaSegredo,
  lerConfigMonitor,
  verificarSaude,
} from "@/lib/monitor.server";
import { sanitizeText } from "@/lib/privacy/redaction";

/**
 * Recuperação automática — endpoint assinado usado apenas pelo painel central.
 *
 * Aceita somente as ações autorizadas abaixo; nenhum comando arbitrário é
 * executado. Reinício/redeploy não é possível daqui: respondemos
 * "recovery_not_supported" para o painel acionar o provedor de hospedagem.
 */

const ACOES = ["recheck", "clear_cache", "reconnect", "diagnostics"] as const;
type Acao = (typeof ACOES)[number];

const MAX_TENTATIVAS = 3;
const JANELA_COOLDOWN_MIN = 15;

export const Route = createFileRoute("/api/public/monitor-recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });

        const { config, faltando } = lerConfigMonitor();
        if (faltando.includes("MONITOR_API_KEY")) {
          return json({ status: "configuration_incomplete" }, 503);
        }

        const bruto = await request.text();
        const timestamp = request.headers.get("x-monitor-timestamp") ?? "";
        const assinatura = (request.headers.get("x-monitor-signature") ?? "").toLowerCase();
        const projectId = request.headers.get("x-project-id") ?? "";

        // Assinatura obrigatória sobre "timestamp.corpo" e janela de 5 minutos.
        const idade = Math.abs(Date.now() - Number(timestamp));
        if (!timestamp || !Number.isFinite(idade) || idade > 5 * 60_000) {
          return json({ status: "invalid_signature" }, 401);
        }
        const esperada = await assinaturaHmac(`${timestamp}.${bruto}`, config.apiKey);
        if (!comparaSegredo(assinatura, esperada))
          return json({ status: "invalid_signature" }, 401);
        if (!projectId || projectId !== config.projectId) {
          return json({ status: "invalid_project" }, 401);
        }

        let corpo: Record<string, unknown>;
        try {
          corpo = JSON.parse(bruto || "{}") as Record<string, unknown>;
        } catch {
          return json({ status: "invalid_body" }, 400);
        }

        const acaoBruta = String(corpo["action"] ?? "");
        if (!(ACOES as readonly string[]).includes(acaoBruta)) {
          // Reinício/redeploy não existe neste projeto: o painel central deve
          // acionar o provedor de hospedagem (webhook do GitHub/host).
          const reinicio = acaoBruta === "restart" || acaoBruta === "redeploy";
          return json(
            {
              status: reinicio ? "recovery_not_supported" : "action_not_allowed",
              restart_supported: false,
            },
            reinicio ? 501 : 400,
          );
        }
        const acao = acaoBruta as Acao;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Cooldown: no máximo três recuperações por janela, evitando laços.
        const desde = new Date(Date.now() - JANELA_COOLDOWN_MIN * 60_000).toISOString();
        const { count } = await supabaseAdmin
          .from("monitor_recovery_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", desde);
        if ((count ?? 0) >= MAX_TENTATIVAS) {
          await supabaseAdmin.from("monitor_recovery_log").insert({
            acao,
            resultado: "cooldown",
            detalhe: `limite de ${MAX_TENTATIVAS} por ${JANELA_COOLDOWN_MIN}min`,
          });
          return json({ status: "cooldown", retry_after_seconds: JANELA_COOLDOWN_MIN * 60 }, 429);
        }

        let resultado = "ok";
        let detalhe = "";
        const saude = await verificarSaude();

        if (acao === "reconnect") {
          // Reconecta os serviços fazendo uma nova verificação completa e um
          // teste de leitura extra no banco.
          const { error } = await supabaseAdmin
            .from("monitor_heartbeats")
            .select("id", { count: "exact", head: true });
          if (error) {
            resultado = "fail";
            detalhe = sanitizeText(error.message, 200);
          }
        }

        if (acao === "clear_cache") {
          // Cache seguro: apenas registros técnicos antigos do monitor.
          const limite = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
          await supabaseAdmin.from("monitor_errors").delete().lt("created_at", limite);
          await supabaseAdmin.from("monitor_heartbeats").delete().lt("created_at", limite);
        }

        if (saude.status !== "healthy" && resultado === "ok") {
          resultado = "degraded";
          detalhe = "verificação concluída, projeto ainda com falha";
        }

        await supabaseAdmin
          .from("monitor_recovery_log")
          .insert({ acao, resultado, detalhe: detalhe || null });

        return json(
          {
            status: resultado,
            action: acao,
            health: saude,
            restart_supported: false,
            timestamp: new Date().toISOString(),
          },
          resultado === "fail" ? 503 : 200,
        );
      },
    },
  },
});
