import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { evolutionGoStatus, type EvolutionGoStatus } from "@/lib/evolution-go.functions";

/**
 * Mostra o estado do servidor Evolution Go que abastece o WhatsApp
 * e leva para o card de configuração no Painel Administrativo.
 */
export function EvolutionGoStatusBadge({ comLink = true }: { comLink?: boolean }) {
  const buscar = useServerFn(evolutionGoStatus);
  const [status, setStatus] = useState<EvolutionGoStatus | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const st = await buscar({});
        if (vivo) setStatus(st);
      } catch {
        /* ignora */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [buscar]);

  if (!status) return null;

  const badge = !status.configurado ? (
    <Badge variant="outline">Evolution Go não configurado</Badge>
  ) : status.erro ? (
    <Badge variant="destructive">Evolution Go indisponível</Badge>
  ) : status.logado ? (
    <Badge className="bg-emerald-500/15 text-emerald-500">Evolution Go conectado</Badge>
  ) : (
    <Badge variant="secondary">Evolution Go aguardando QR Code</Badge>
  );

  if (!comLink) return badge;

  return (
    <Link
      to="/admin"
      hash="evolution-go"
      className="inline-flex items-center gap-1.5 hover:opacity-80"
      title="Configurar o Evolution Go no Painel Administrativo"
      onClick={(e) => e.stopPropagation()}
    >
      {badge}
      <Settings2 className="size-3.5 text-muted-foreground" />
    </Link>
  );
}
