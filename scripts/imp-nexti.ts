import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadConfig, normalizeBaseUrl } from "@/lib/nexti.functions";
import { executarImportacaoVisitas } from "@/lib/nexti-visitas.functions";
const bruta = await loadConfig(supabaseAdmin as never);
const config = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };
const r = await executarImportacaoVisitas(config, supabaseAdmin as never, { completo: true, inicio: "2026-06-01", fim: "2026-08-31" });
console.log(JSON.stringify(r, null, 1));
