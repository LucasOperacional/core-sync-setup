import { Link } from "@tanstack/react-router";
import { ChevronRight, TrafficCone } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Atalho que abre a página de visitas por posto (editável, em semáforo). */
export function VisitasPorPostoCard() {
  return (
    <Link to="/supervisao-visitas-postos" className="block">
      <Card className="shadow-lg border-border/50 transition-colors hover:border-primary/50">
        <CardHeader className="bg-muted/30 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrafficCone className="size-5 text-primary" /> Quantidade de visitas por posto
            <ChevronRight className="ms-auto size-5 text-muted-foreground" />
          </CardTitle>
          <CardDescription>
            Abre a página com todos os postos para ver e editar a quantidade de visitas: verde em
            dia, amarelo com atenção e vermelho sem visita.
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
