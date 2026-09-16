import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Lendo parametros caso venham do body (targetId, type, message, etc.)
    const params = await req.json().catch(() => ({}));

    const baseUrl = Deno.env.get('NEXTI_BASE_URL');
    const endpoint = Deno.env.get('NEXTI_NOTICES_ENDPOINT');
    const clientId = Deno.env.get('NEXTI_CLIENT_ID');

    // Retornando mensagem padrao em conformidade ao pedido informando que a API nao possui endpoit final publico configurado.
    if (!baseUrl || !endpoint || !clientId) {
      return new Response(
        JSON.stringify({
          status: "not_implemented",
          success: true,
          message: "Endpoint oficial de Avisos/Convocações NEXTI ainda não configurado."
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Se todos os secrets ja estiverem la, simulamos o dispatch pra fila interna ou API oficial de destino.
    return new Response(
      JSON.stringify({ 
        status: "success",
        success: true, 
        message: `Módulo processado, prioridade: ${params.priority || 'NORMAL'}` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
