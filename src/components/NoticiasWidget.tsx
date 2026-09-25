import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { listarNoticias } from "@/lib/noticias.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatadorData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function NoticiasWidget() {
  const buscarNoticias = useServerFn(listarNoticias);
  const consulta = useQuery({
    queryKey: ["noticias-inicio"],
    queryFn: () => buscarNoticias(),
    staleTime: 10 * 60 * 1_000,
    refetchInterval: 15 * 60 * 1_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Card className="mt-8 overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Newspaper className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-lg">Notícias</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Principais notícias do Brasil</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void consulta.refetch()}
          disabled={consulta.isFetching}
          title="Atualizar notícias"
          aria-label="Atualizar notícias"
        >
          <RefreshCw className={consulta.isFetching ? "animate-spin" : ""} />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {consulta.isPending ? (
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, indice) => (
              <div key={indice} className="min-h-36 animate-pulse bg-card p-5">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="mt-5 h-4 w-full rounded bg-muted" />
                <div className="mt-2 h-4 w-4/5 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : consulta.isError ? (
          <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
            <Newspaper className="size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">Notícias indisponíveis agora</p>
            <p className="mt-1 text-sm text-muted-foreground">Tente atualizar em alguns instantes.</p>
            <Button className="mt-4" variant="outline" size="sm" onClick={() => void consulta.refetch()}>
              <RefreshCw /> Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {consulta.data.noticias.map((noticia, indice) => (
              <a
                key={`${noticia.link}-${indice}`}
                href={noticia.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-40 flex-col bg-card p-5 transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate font-semibold text-primary">{noticia.fonte}</span>
                  <ExternalLink className="size-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <h3 className="mt-4 line-clamp-3 text-base font-semibold leading-6 text-foreground">
                  {noticia.titulo}
                </h3>
                <time className="mt-auto pt-5 text-xs text-muted-foreground" dateTime={noticia.publicadaEm}>
                  {formatadorData.format(new Date(noticia.publicadaEm))}
                </time>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}