import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EvolutionGoCard } from "@/components/EvolutionGoCard";
import { EvolutionGoStatusBadge } from "@/components/EvolutionGoStatusBadge";
import { WhatsAppQueuesCard } from "@/components/WhatsAppQueuesCard";
import { WhatsAppMenuCard } from "@/components/WhatsAppMenuCard";

export function WhatsAppAdminCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-5 text-primary" />
            <CardTitle>WhatsApp</CardTitle>
          </div>
          <EvolutionGoStatusBadge />
        </div>
        <CardDescription>
          Configuração do servidor de WhatsApp usado pelo chat interno para enviar e receber mensagens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <WhatsAppQueuesCard />
        <Separator />
        <WhatsAppMenuCard />
        <Separator />
        <EvolutionGoCard />
      </CardContent>
    </Card>
  );
}
