import { useState } from "react";
import { Download, MapPin, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import jsPDF from "jspdf";

export interface RegistroAuditoria {
  dataHora: string;
  ip: string;
  local: string;
  descricao?: string;
}

export async function capturarIpLocal(): Promise<{ ip: string; local: string }> {
  let ip = "Não identificado";
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (res.ok) {
      const data = await res.json();
      ip = data.ip;
    }
  } catch {
    // Falha de conexão com a API de IP
  }

  let local = "Não autorizada ou indisponível";
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });
    local = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
  } catch {
    // Geolocalização recusada ou indisponível
  }

  return { ip, local };
}

export function GerarComprovanteAuditoriaCard({
  registro,
}: {
  registro?: RegistroAuditoria | null;
}) {
  const [gerando, setGerando] = useState(false);

  const handleGerar = async () => {
    setGerando(true);
    try {
      const { ip, local } = registro
        ? { ip: registro.ip, local: registro.local }
        : await capturarIpLocal();

      const dataHora = registro?.dataHora ?? new Date().toLocaleString("pt-BR");

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const margem = 18;
      const largura = 210 - margem * 2;
      let y = 22;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("COMPROVANTE DE AUDITORIA", 105, y, { align: "center" });
      y += 8;

      doc.setDrawColor(40);
      doc.line(margem, y, 210 - margem, y);
      y += 8;

      const campo = (rotulo: string, valor: string) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(rotulo, margem, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const linhas = doc.splitTextToSize(valor || "—", largura) as string[];
        doc.text(linhas, margem, y + 4.5);
        y += 4.5 + linhas.length * 4.6 + 3;
      };

      if (registro?.descricao) campo("MOVIMENTAÇÃO", registro.descricao);
      campo("DATA E HORA DA GERAÇÃO", dataHora);
      campo("ENDEREÇO DE ACESSO (IP)", ip);
      campo("GEOLOCALIZAÇÃO", local);

      y += 4;
      doc.setFontSize(7.5);
      doc.setTextColor(90);
      const rodape = doc.splitTextToSize(
        `Comprovante gerado eletronicamente em ${dataHora}. Os dados de data, hora, endereço de acesso e localização foram registrados no momento da geração para fins de auditoria (MP 2.200-2/2001, art. 10, §2º).`,
        largura,
      ) as string[];
      doc.text(rodape, margem, Math.max(y, 275));
      doc.setTextColor(0);

      doc.save(`Comprovante_Auditoria_${Date.now()}.pdf`);
      toast.success("Comprovante gerado com sucesso.");
    } catch {
      toast.error("Erro ao gerar o comprovante.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          Comprovante de IP e Local
        </CardTitle>
        <CardDescription>
          Gere um PDF para auditoria contendo o endereço de IP responsável pelo acesso, a data e
          hora do dispositivo, e a sua localização via GPS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {registro ? (
          <dl className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
              <MapPin className="size-3.5" /> Registrado na movimentação
            </p>
            {registro.descricao ? (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Movimentação</dt>
                <dd>{registro.descricao}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Data e hora</dt>
              <dd>{registro.dataHora}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                Endereço de acesso (IP)
              </dt>
              <dd className="font-mono">{registro.ip}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Geolocalização</dt>
              <dd className="font-mono">{registro.local}</dd>
            </div>
          </dl>
        ) : null}
        <Button onClick={handleGerar} disabled={gerando} className="w-full">
          <Download className="mr-2 size-4" />
          {gerando ? "Registrando dados..." : "Gerar Comprovante"}
        </Button>
      </CardContent>
    </Card>
  );
}
