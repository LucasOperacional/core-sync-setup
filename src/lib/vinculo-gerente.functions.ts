import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { areaGerenteCanonica } from "@/lib/areas-gerentes";

export type PostoVinculado = {
  id: string;
  nome: string;
  localidade: string | null;
};

export type VinculoGerente = {
  ehGerente: boolean;
  gerenteNome: string | null;
  postos: PostoVinculado[];
};

/**
 * Descobre se o usuário logado é um dos gerentes de área (pelo nome do perfil)
 * e devolve os postos vinculados à área dele.
 */
export const meuVinculoGerente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VinculoGerente> => {
    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    const nomePerfil = (perfil?.display_name ?? "").trim();
    const gerenteNome = nomePerfil ? areaGerenteCanonica(nomePerfil) : null;

    if (!gerenteNome) {
      return { ehGerente: false, gerenteNome: null, postos: [] };
    }

    const { data: postos } = await context.supabase
      .from("areas_gerentes_postos")
      .select("id, posto_nome, posto_localidade")
      .eq("gerente_nome", gerenteNome)
      .order("posto_nome", { ascending: true });

    return {
      ehGerente: true,
      gerenteNome,
      postos: (postos ?? []).map((p) => ({
        id: p.id,
        nome: p.posto_nome,
        localidade: p.posto_localidade,
      })),
    };
  });
