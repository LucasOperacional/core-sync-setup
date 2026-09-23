import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, MapPin, Phone, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buscarLeadsMaps, type LeadMaps } from "@/lib/prospeccao-maps.functions";

export const Route = createFileRoute("/_authenticated/prospeccao-maps")({
  head: () => ({
    meta: [
      { title: "Prospecção Google Maps | Comercial" },
      {
        name: "description",
        content:
          "Busque empresas no Google Maps por segmento e cidade e exporte a lista de contatos para prospecção comercial.",
      },
      { property: "og:title", content: "Prospecção Google Maps | Comercial" },
      {
        property: "og:description",
        content: "Geração de leads a partir de buscas no Google Maps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProspeccaoMapsPage,
});

function paraCsv(leads: LeadMaps[]): string {
  const cab = [
    "Nome",
    "Categoria",
    "Telefone",
    "Site",
    "Endereço",
    "Nota",
    "Avaliações",
    "Latitude",
    "Longitude",
    "Link",
  ];
  const escapar = (v: string | number | null) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = leads.map((l) =>
    [
      l.nome,
      l.categoria,
      l.telefone,
      l.site,
      l.endereco,
      l.nota,
      l.avaliacoes,
      l.latitude,
      l.longitude,
      l.mapsUrl,
    ]
      .map(escapar)
      .join(";"),
  );
  return [cab.join(";"), ...linhas].join("\n");
}

function ProspeccaoMapsPage() {
  const [consulta, setConsulta] = useState("");
  const [limite, setLimite] = useState(20);
  const [leads, setLeads] = useState<LeadMaps[]>([]);
  const buscar = useServerFn(buscarLeadsMaps);

  const mutacao = useMutation({
    mutationFn: async () => buscar({ data: { consulta, limite } }),
    onSuccess: (r) => setLeads(r.leads),
  });

  const baixarCsv = () => {
    const blob = new Blob(["\uFEFF" + paraCsv(leads)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-google-maps-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <MapPin className="size-6 text-primary" />
            Prospecção Google Maps
          </h1>
          <p className="text-sm text-muted-foreground">
            Busque empresas por segmento e cidade, veja telefone, site e avaliações
            e exporte a lista em CSV.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova busca</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 md:flex-row md:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (consulta.trim().length >= 2) mutacao.mutate();
              }}
            >
              <Input
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Ex.: condomínios residenciais em Goiânia"
                className="flex-1"
              />
              <Input
                type="number"
                min={1}
                max={60}
                value={limite}
                onChange={(e) => setLimite(Number(e.target.value) || 20)}
                className="md:w-28"
                aria-label="Quantidade de resultados"
              />
              <Button type="submit" disabled={mutacao.isPending}>
                {mutacao.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Buscar
              </Button>
              {leads.length > 0 && (
                <Button type="button" variant="outline" onClick={baixarCsv}>
                  <Download className="size-4" />
                  Exportar CSV
                </Button>
              )}
            </form>
            {mutacao.isError && (
              <p className="mt-3 text-sm text-destructive">
                {(mutacao.error as Error).message}
              </p>
            )}
          </CardContent>
        </Card>

        {leads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {leads.length} empresa(s) encontrada(s)
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Empresa</th>
                    <th className="py-2 pr-3">Telefone</th>
                    <th className="py-2 pr-3">Endereço</th>
                    <th className="py-2 pr-3">Avaliação</th>
                    <th className="py-2">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-t border-border/60 align-top">
                      <td className="py-3 pr-3">
                        <span className="font-medium">{l.nome}</span>
                        {l.categoria && (
                          <span className="block text-xs text-muted-foreground">
                            {l.categoria}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {l.telefone ? (
                          <a
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            href={`tel:${l.telefone.replace(/\D/g, "")}`}
                          >
                            <Phone className="size-3.5" />
                            {l.telefone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{l.endereco}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {l.nota !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3.5 text-amber-500" />
                            {l.nota.toFixed(1)}
                            <span className="text-xs text-muted-foreground">
                              ({l.avaliacoes ?? 0})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-col gap-1">
                          {l.mapsUrl && (
                            <a
                              className="text-primary hover:underline"
                              href={l.mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver no Maps
                            </a>
                          )}
                          {l.site && (
                            <a
                              className="text-primary hover:underline"
                              href={l.site}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Site
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
