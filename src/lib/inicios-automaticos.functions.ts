import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrigemInicio = "chegada" | "geofence";

export type InicioAutomatico = {
  id: string;
  userId: string;
  supervisorNome: string;
  postoNextiId: number | null;
  postoNome: string;
  latitude: number | null;
  longitude: number | null;
  precisaoMetros: number | null;
  origem: OrigemInicio;
  criadoEm: string;
};

/**
 * Registra o horário e a localização confirmada de cada início automático do
 * cronômetro da Supervisão de Campo (chegada à porta do posto ou permanência
 * dentro do posto), permitindo conferir as visitas depois.
 */
export const registrarInicioAutomatico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      postoNextiId?: number | null;
      postoNome?: string;
      latitude?: number | null;
      longitude?: number | null;
      precisaoMetros?: number | null;
      origem?: OrigemInicio;
    }) => ({
      postoNextiId: Number.isFinite(Number(input?.postoNextiId)) ? Number(input?.postoNextiId) : null,
      postoNome: String(input?.postoNome ?? "").slice(0, 200),
      latitude: Number.isFinite(Number(input?.latitude)) ? Number(input?.latitude) : null,
      longitude: Number.isFinite(Number(input?.longitude)) ? Number(input?.longitude) : null,
      precisaoMetros: Number.isFinite(Number(input?.precisaoMetros))
        ? Number(input?.precisaoMetros)
        : null,
      origem: input?.origem === "chegada" ? ("chegada" as const) : ("geofence" as const),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { error } = await (context.supabase.from("inicios_automaticos_visita" as never) as any).insert({
      user_id: context.userId,
      supervisor_nome: (perfil?.display_name as string | null) ?? "",
      posto_nexti_id: data.postoNextiId,
      posto_nome: data.postoNome,
      latitude: data.latitude,
      longitude: data.longitude,
      precisao_metros: data.precisaoMetros,
      origem: data.origem,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Lista os inícios automáticos para conferência: gestores (admin, diretor,
 * cordenador) veem todos; os demais veem apenas os próprios (a política de
 * segurança da tabela já garante esse recorte).
 */
export const listarIniciosAutomaticos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InicioAutomatico[]> => {
    const { data, error } = await (context.supabase.from("inicios_automaticos_visita" as never) as any)
      .select(
        "id,user_id,supervisor_nome,posto_nexti_id,posto_nome,latitude,longitude,precisao_metros,origem,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    return (data ?? []).map((linha: any) => ({
      id: linha.id,
      userId: linha.user_id,
      supervisorNome: (linha.supervisor_nome as string | null) ?? "",
      postoNextiId: linha.posto_nexti_id ?? null,
      postoNome: (linha.posto_nome as string | null) ?? "",
      latitude: linha.latitude === null ? null : Number(linha.latitude),
      longitude: linha.longitude === null ? null : Number(linha.longitude),
      precisaoMetros: linha.precisao_metros === null ? null : Number(linha.precisao_metros),
      origem: (linha.origem as OrigemInicio) ?? "geofence",
      criadoEm: linha.created_at,
    }));
  });
