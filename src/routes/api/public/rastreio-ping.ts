import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface Corpo {
  token?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  precisaoMetros?: unknown;
  velocidade?: unknown;
  direcao?: unknown;
  tipoSinal?: unknown;
  bateria?: unknown;
  capturadoEm?: unknown;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/**
 * Endpoint usado pelo service worker para continuar enviando a posição do
 * supervisor mesmo quando o site/PWA não está em primeiro plano.
 * A autenticação é feita pelo token do próprio usuário enviado no corpo.
 */
export const Route = createFileRoute("/api/public/rastreio-ping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let corpo: Corpo;
        try {
          corpo = (await request.json()) as Corpo;
        } catch {
          return new Response("Corpo inválido", { status: 400 });
        }

        const token = typeof corpo.token === "string" ? corpo.token : "";
        const latitude = numero(corpo.latitude);
        const longitude = numero(corpo.longitude);
        if (!token || latitude === null || longitude === null) {
          return new Response("Dados incompletos", { status: 400 });
        }

        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return new Response("Indisponível", { status: 503 });

        const supabase = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: { Authorization: `Bearer ${token}` },
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              h.set("apikey", key);
              h.set("Authorization", `Bearer ${token}`);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const { data: usuario, error: erroAuth } = await supabase.auth.getUser(token);
        const userId = usuario?.user?.id;
        if (erroAuth || !userId) return new Response("Não autorizado", { status: 401 });

        const { data: ehSupervisor } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "supervisor",
        });
        if (ehSupervisor !== true) return new Response("Não autorizado", { status: 403 });

        const { data: perfil } = await supabase
          .from("user_profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();

        const capturadoEm =
          typeof corpo.capturadoEm === "string" ? corpo.capturadoEm : new Date().toISOString();

        const { error } = await supabase.from("rastreamento_localizacoes").insert({
          user_id: userId,
          nome: perfil?.display_name ?? null,
          latitude,
          longitude,
          precisao_metros: numero(corpo.precisaoMetros),
          velocidade: numero(corpo.velocidade),
          direcao: numero(corpo.direcao),
          tipo_sinal: typeof corpo.tipoSinal === "string" ? corpo.tipoSinal : null,
          bateria: numero(corpo.bateria),
          capturado_em: capturadoEm,
        });
        if (error) return new Response("Falha ao registrar", { status: 500 });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
