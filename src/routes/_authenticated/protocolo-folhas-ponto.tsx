import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  Calculator,
  ChevronRight,
  ClipboardList,
  Clock,
  FileStack,
  MapPinned,
  Menu,
  Palmtree,
  Scissors,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
import { FlagsUsuarioNexti } from "@/components/FlagsUsuarioNexti";
import { SincronizarColaboradoresNexti } from "@/components/SincronizarColaboradoresNexti";
import { MovimentacaoLoteNexti } from "@/components/MovimentacaoLoteNexti";

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

type Aba =
  | "protocolar"
  | "protocolos"
  | "status"
  | "separar"
  | "horas-extras"
  | "calculadora"
  | "outras-lotacoes"
  | "ativos"
  | "ferias"
  | "usuarios"
  | "demitidos";

const ITENS_MENU: { value: Aba; label: string; icon: typeof Activity }[] = [
  { value: "protocolar", label: "Protocolar folhas", icon: ClipboardList },
  { value: "protocolos", label: "Protocolos salvos", icon: FileStack },
  { value: "status", label: "Status de protocolação", icon: Activity },
  { value: "separar", label: "Separar PDF", icon: Scissors },
  { value: "horas-extras", label: "Horas extras", icon: Clock },
  { value: "calculadora", label: "Calculadora de Folha", icon: Calculator },
  { value: "outras-lotacoes", label: "Outras lotações", icon: MapPinned },
  { value: "ativos", label: "Funcionários ativos", icon: Users },
  { value: "ferias", label: "Férias", icon: Palmtree },
  { value: "usuarios", label: "Usuários", icon: UserPlus },
  { value: "demitidos", label: "Demitidos", icon: UserMinus },
];

function ProtocoloFolhasPonto() {
  const queryClient = useQueryClient();
  // Liga o monitoramento da IA Operacional nesta página.
  useOperationalAI();
  const tempoReal = useProtocoloFolhasRealtimeSync(queryClient);

  const [folhas, setFolhas] = useState<FolhaSeparar[]>([]);
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [aba, setAba] = useState<Aba>("protocolar");
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <main className="min-h-screen bg-background">
      <PageHeader
        icon={FileStack}
        eyebrow="Folhas de ponto"
        title="Protocolo de Folhas de Ponto"
        description="Importe, protocole e acompanhe folhas por empresa com os colaboradores sincronizados em tempo real."
      />

      <div className="mx-auto max-w-[88rem] px-4 sm:px-6 md:flex md:gap-6 lg:px-8">
        <div className="py-3 md:hidden">
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            aria-expanded={menuAberto}
            aria-controls="menu-protocolo-folhas"
          >
            <span className="flex items-center gap-2">
              <Menu className="size-4" /> Menu do protocolo
            </span>
            {menuAberto ? <X className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>

        <aside
          id="menu-protocolo-folhas"
          className={`${menuAberto ? "block" : "hidden"} shrink-0 border-border bg-muted/20 py-4 md:sticky md:top-2 md:block md:max-h-[calc(100vh-1rem)] md:w-72 md:self-start md:overflow-y-auto md:rounded-lg md:border md:px-3 md:py-5`}
        >
          <nav aria-label="Menu do protocolo de folhas de ponto">
            <p className="mb-4 px-3 text-xs font-semibold uppercase text-muted-foreground">
              Protocolo de folhas
            </p>
            <div className="space-y-1">
              {ITENS_MENU.map((item) => {
                const ativa = aba === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setAba(item.value);
                      setMenuAberto(false);
                    }}
                    aria-current={ativa ? "page" : undefined}
                    className={`group flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-medium leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      ativa
                        ? "bg-primary/10 text-primary ring-1 ring-primary/25"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <item.icon className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>

        <section className="min-w-0 flex-1 py-5">
          <div className="space-y-5">
            <OperationalErrorBoundary componentName="Sincronização automática NEXTI">
              <SincronizacaoAutomaticaNexti />
            </OperationalErrorBoundary>

            <DashboardCardsProtocolo tempoReal={tempoReal} />

            <OperationalErrorBoundary componentName="Contagem de demitidos NEXTI">
              <ContagemDemitidosCard />
            </OperationalErrorBoundary>

            <Tabs value={aba} onValueChange={(valor) => setAba(valor as Aba)} className="space-y-5">
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
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <MovimentacaoLoteNexti />
                  </div>
                  <OperationalErrorBoundary componentName="Cadastro de usuários NEXTI">
                    <AbaUsuariosNexti />
                  </OperationalErrorBoundary>
                  <OperationalErrorBoundary componentName="Sincronização de colaboradores NEXTI">
                    <SincronizarColaboradoresNexti />
                  </OperationalErrorBoundary>
                  <OperationalErrorBoundary componentName="Opções do colaborador NEXTI">
                    <FlagsUsuarioNexti />
                  </OperationalErrorBoundary>
                </div>
              </TabsContent>

              <TabsContent value="demitidos">
                <OperationalErrorBoundary componentName="Demitidos NEXTI">
                  <DemitidosNextiCard />
                </OperationalErrorBoundary>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </div>
    </main>
  );
}
