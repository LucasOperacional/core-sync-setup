import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const buscaSchema = z.object({
  consulta: z.string().min(2).max(200),
  limite: z.number().int().min(1).max(60).default(20),
});

export interface LeadMaps {
  id: string;
  nome: string;
  endereco: string;
  telefone: string;
  site: string;
  categoria: string;
  nota: number | null;
  avaliacoes: number | null;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string;
}

interface PlaceApi {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  location?: { latitude?: number; longitude?: number };
}

const CAMPOS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.location",
].join(",");

/** Busca empresas no Google Maps (Places API) para prospecção comercial. */
export const buscarLeadsMaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => buscaSchema.parse(data))
  .handler(async ({ data }): Promise<{ leads: LeadMaps[] }> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) {
      throw new Error("Integração do Google Maps não está configurada.");
    }

    const leads: LeadMaps[] = [];
    let pageToken: string | undefined;

    while (leads.length < data.limite) {
      const corpo: Record<string, unknown> = {
        textQuery: data.consulta,
        pageSize: Math.min(20, data.limite - leads.length),
        languageCode: "pt-BR",
        regionCode: "BR",
      };
      if (pageToken) corpo["pageToken"] = pageToken;

      const resposta = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": `${CAMPOS},nextPageToken`,
        },
        body: JSON.stringify(corpo),
      });

      if (!resposta.ok) {
        const texto = await resposta.text();
        console.error(`Places searchText falhou [${resposta.status}]: ${texto}`);
        throw new Error(`Busca no Google Maps falhou (${resposta.status}).`);
      }

      const json = (await resposta.json()) as {
        places?: PlaceApi[];
        nextPageToken?: string;
      };

      for (const p of json.places ?? []) {
        leads.push({
          id: p.id ?? crypto.randomUUID(),
          nome: p.displayName?.text ?? "",
          endereco: p.formattedAddress ?? "",
          telefone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? "",
          site: p.websiteUri ?? "",
          categoria: p.primaryTypeDisplayName?.text ?? "",
          nota: typeof p.rating === "number" ? p.rating : null,
          avaliacoes: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
          latitude: p.location?.latitude ?? null,
          longitude: p.location?.longitude ?? null,
          mapsUrl: p.googleMapsUri ?? "",
        });
      }

      pageToken = json.nextPageToken;
      if (!pageToken || !(json.places ?? []).length) break;
    }

    return { leads: leads.slice(0, data.limite) };
  });
