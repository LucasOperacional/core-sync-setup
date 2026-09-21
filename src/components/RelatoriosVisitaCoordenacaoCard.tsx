import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listarRelatoriosRoteiroCoordenacao } from "@/lib/roteiro-campo.functions";

function dataBr(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5 text-primary" /> Relatórios de visita de campo
        </CardTitle>
        <CardDescription>
          Cada roteiro salvo pela supervisão chega aqui em PDF, com respostas, não conformidades e
          fotos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando relatórios...
          </p>
        ) : relatorios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum relatório recebido até o momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Data da visita</th>
                  <th className="py-2 pr-4">Início</th>
                  <th className="py-2 pr-4">Finalização</th>
                  <th className="py-2 pr-4">Posto</th>
                  <th className="py-2 pr-4">Enviado por</th>
                  <th className="py-2 pr-4">Conformidade</th>
                  <th className="py-2 pr-4">PDF</th>
                </tr>
              </thead>
              <tbody>
                {relatorios.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      {r.data_visita?.split("-").reverse().join("/")}
                    </td>
                    <td className="py-2 pr-4">
                      {horaBr(r.relatorio_enviado_em, r.duracao_segundos ?? 0)}
                    </td>
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {horaBr(r.relatorio_enviado_em)}
                    </td>
                    <td className="py-2 pr-4">{r.posto}</td>
                    <td className="py-2 pr-4">{r.enviado_por_nome || r.supervisor || "—"}</td>
                    <td className="py-2 pr-4 font-semibold">{r.percentual_conformidade}%</td>
                    <td className="py-2 pr-4">
                      {r.url ? (
                        <Button asChild size="sm" variant="secondary">
                          <a href={r.url} target="_blank" rel="noreferrer">
                            Abrir PDF
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">indisponível</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
