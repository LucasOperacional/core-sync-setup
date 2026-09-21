import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Download, 
  FileText, 
  Loader2, 
  MapPin, 
  CalendarDays, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle 
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listarRelatoriosRoteiroCoordenacao } from "@/lib/roteiro-campo.functions";

function horaBr(iso: string | null, subSegundos: number = 0) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (subSegundos > 0) d.setSeconds(d.getSeconds() - subSegundos);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Relatórios em PDF enviados automaticamente pela supervisão de campo. */
export function RelatoriosVisitaCoordenacaoCard() {
  const carregar = useServerFn(listarRelatoriosRoteiroCoordenacao);
  const { data, isLoading } = useQuery({
    queryKey: ["relatorios-roteiro-coordenacao"],
    queryFn: () => carregar(),
    refetchInterval: 60_000,
  });

  const relatorios = data?.relatorios ?? [];

  return (
    <Card className="shadow-lg border-border/50">
      <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="size-5 text-primary" /> Relatórios de Visita de Campo
        </CardTitle>
        <CardDescription>
          Supervisões finalizadas. Faça download do PDF com evidências fotográficas e não conformidades.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="size-8 animate-spin mb-2" />
            <p className="text-sm">Carregando relatórios...</p>
          </div>
        ) : relatorios.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-muted-foreground text-center">
            <FileText className="size-10 mb-2 opacity-20" />
            <p className="text-sm font-medium">Nenhum relatório recebido até o momento.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold">Local e Responsável</TableHead>
                <TableHead className="font-semibold text-center">Data</TableHead>
                <TableHead className="font-semibold text-center">Duração</TableHead>
                <TableHead className="font-semibold text-center">Conformidade</TableHead>
                <TableHead className="text-right font-semibold">Arquivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatorios.map((r) => {
                const conf = typeof r.percentual_conformidade === "number" ? r.percentual_conformidade : 0;
                let badgeColor = "bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20";
                let Icon = CheckCircle2;
                if (conf < 70) {
                  badgeColor = "bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20";
                  Icon = XCircle;
                } else if (conf < 95) {
                  badgeColor = "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400 hover:bg-yellow-500/20";
                  Icon = AlertTriangle;
                }

                return (
                  <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-muted-foreground" />
                        {r.posto}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 ml-5">
                        Por {r.enviado_por_nome || r.supervisor || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5 text-sm">
                        <CalendarDays className="size-3.5 text-muted-foreground" />
                        {r.data_visita?.split("-").reverse().join("/")}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="size-3" /> {horaBr(r.relatorio_enviado_em, r.duracao_segundos ?? 0)} às {horaBr(r.relatorio_enviado_em)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`border-transparent font-medium gap-1 ${badgeColor}`}>
                        <Icon className="size-3.5" />
                        {conf}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.url ? (
                        <Button asChild size="sm" className="gap-1.5 h-8">
                          <a href={r.url} target="_blank" rel="noreferrer">
                            <Download className="size-3.5" />
                            Baixar
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Indisponível</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
