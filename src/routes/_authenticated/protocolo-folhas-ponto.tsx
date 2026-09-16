import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  Calculator,
  ClipboardList,
  Clock,
  FileStack,
  MapPinned,
  Scissors,
  Users,
  Palmtree,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaProtocolar } from "@/components/aba-protocolar";
import { AbaProtocolosSalvos } from "@/components/aba-protocolos-salvos";
import { AbaAtivos } from "@/components/aba-ativos";
import { AbaFerias } from "@/components/aba-ferias";
import { AbaProtocolacao } from "@/components/aba-protocolacao";
import { AbaSepararPdf, type FolhaPonto as FolhaSeparar } from "@/components/aba-separar-pdf";
import { HorasExtrasCard } from "@/components/HorasExtrasCard";
import { CalculadoraFolhaCard } from "@/components/CalculadoraFolhaCard";
import { DashboardCardsProtocolo } from "@/components/DashboardCardsProtocolo";
import { DemitidosNextiCard } from "@/components/DemitidosNextiCard";
import { ContagemDemitidosCard } from "@/components/ContagemDemitidosCard";
import { AbaUsuariosNexti } from "@/components/AbaUsuariosNexti";

import { OutrasLotacoesCards } from "@/components/OutrasLotacoesCards";
import { SincronizacaoAutomaticaNexti } from "@/components/SincronizacaoAutomaticaNexti";
import { ServerFunctionAwareInlineError } from "@/components/server-function-refresh-notice";
import { OperationalErrorBoundary } from "@/components/OperationalErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { useOperationalAI } from "@/hooks/use-operational-ai";
import { useProtocoloFolhasRealtimeSync } from "@/lib/protocolo-folhas-sync";

export const Route = createFileRoute("/_authenticated/protocolo-folhas-ponto")({
  head: () => ({
    meta: [
      { title: "Protocolo de Folhas de Ponto | Gestão de Entregas" },
      {
        name: "description",
        content:
          "Leia PDFs de folhas de ponto, protocole entregas, separe arquivos por empresa e acompanhe funcionários ativos em um só lugar.",
      },
      { property: "og:title", content: "Protocolo de Folhas de Ponto" },
      {
        property: "og:description",
        content:
          "Importação de PDFs e planilhas, protocolos com PDF, separação por empresa e status de protocolação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProtocoloFolhasPonto,
  errorComponent: ({ error }) => <ServerFunctionAwareInlineError error={error} className="m-8" />,
  notFoundComponent: () => <p className="p-8 text-sm">Conteúdo não encontrado.</p>,
});

function ProtocoloFolhasPonto() {
  const queryClient = useQueryClient();
  // Liga o monitoramento da IA Operacional nesta página.
  useOperationalAI();
  const tempoReal = useProtocoloFolhasRealtimeSync(queryClient);

  const [folhas, setFolhas] = useState<FolhaSeparar[]>([]);
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);

  return (
    <main className="min-h-screen bg-background">
      <PageHeader
        icon={FileStack}
        eyebrow="Folhas de ponto"
        title="Protocolo de Folhas de Ponto"
        description="Importe, protocole e acompanhe folhas por empresa com os colaboradores sincronizados em tempo real."
      />

      <section className="mx-auto max-w-[88rem] px-4 py-5 sm:px-6 lg:px-8">
        <div className="space-y-5">
          <OperationalErrorBoundary componentName="Sincronização automática NEXTI">
            <SincronizacaoAutomaticaNexti />
          </OperationalErrorBoundary>

          <DashboardCardsProtocolo tempoReal={tempoReal} />

          <OperationalErrorBoundary componentName="Contagem de demitidos NEXTI">
            <ContagemDemitidosCard />
          </OperationalErrorBoundary>

          <Tabs defaultValue="protocolar" className="space-y-5">
            <TabsList className="sticky top-16 z-20 flex h-auto w-full flex-nowrap justify-start overflow-x-auto bg-card shadow-xs lg:top-2">
              <TabsTrigger value="protocolar" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                Protocolar
              </TabsTrigger>
              <TabsTrigger value="protocolos" className="gap-2">
                <FileStack className="h-4 w-4" />
                Protocolos salvos
              </TabsTrigger>
              <TabsTrigger value="status" className="gap-2">
                <Activity className="h-4 w-4" />
                Status de protocolação
              </TabsTrigger>
              <TabsTrigger value="separar" className="gap-2">
                <Scissors className="h-4 w-4" />
                Separar PDF
              </TabsTrigger>
              <TabsTrigger value="horas-extras" className="gap-2">
                <Clock className="h-4 w-4" />
                Horas extras
              </TabsTrigger>
              <TabsTrigger value="calculadora" className="gap-2">
                <Calculator className="h-4 w-4" />
                Calculadora de Folha
              </TabsTrigger>

              <TabsTrigger value="outras-lotacoes" className="gap-2">
                <MapPinned className="h-4 w-4" />
                Outras lotações
              </TabsTrigger>
              <TabsTrigger value="ativos" className="gap-2">
                <Users className="h-4 w-4" />
                Funcionários ativos
              </TabsTrigger>
              <TabsTrigger value="ferias" className="gap-2">
                <Palmtree className="h-4 w-4" />
                Férias
              </TabsTrigger>
              <TabsTrigger value="usuarios" className="gap-2">
                <UserPlus className="h-4 w-4" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="demitidos" className="gap-2">
                <UserMinus className="h-4 w-4" />
                Demitidos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="protocolar">
              <OperationalErrorBoundary componentName="Protocolar folhas de ponto">
                <AbaProtocolar />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="protocolos">
              <OperationalErrorBoundary componentName="Protocolos salvos">
                <AbaProtocolosSalvos />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="status">
              <OperationalErrorBoundary componentName="Status de protocolação">
                <AbaProtocolacao />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="separar">
              <OperationalErrorBoundary componentName="Separar PDF de folhas">
                <AbaSepararPdf
                  folhas={folhas}
                  setFolhas={setFolhas}
                  arquivoPdf={arquivoPdf}
                  setArquivoPdf={setArquivoPdf}
                />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="horas-extras">
              <OperationalErrorBoundary componentName="Separação de horas extras">
                <HorasExtrasCard />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="calculadora">
              <OperationalErrorBoundary componentName="Calculadora de folha">
                <CalculadoraFolhaCard />
              </OperationalErrorBoundary>
            </TabsContent>

            <TabsContent value="outras-lotacoes">
              <OperationalErrorBoundary componentName="Outras lotações">
                <OutrasLotacoesCards />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="ativos">
              <OperationalErrorBoundary componentName="Funcionários ativos">
                <AbaAtivos />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="ferias">
              <OperationalErrorBoundary componentName="Importar Férias">
                <AbaFerias />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="usuarios">
              <OperationalErrorBoundary componentName="Cadastro de usuários NEXTI">
                <AbaUsuariosNexti />
              </OperationalErrorBoundary>
            </TabsContent>
            <TabsContent value="demitidos">
              <OperationalErrorBoundary componentName="Demitidos NEXTI">
                <DemitidosNextiCard />
              </OperationalErrorBoundary>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </main>
  );
}
