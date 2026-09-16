import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, History, RefreshCw, Download, Search } from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listarAtividades } from "@/lib/atividades.functions";
import { downloadCsv } from "@/lib/dashboard-utils";

export const Route = createFileRoute("/_authenticated/logs-atividades")({
  head: () => ({
    meta: [
      { title: "Logs de atividades dos usuários" },
      {
        name: "description",
        content:
          "Acompanhe todas as atividades realizadas pelos usuários dentro do sistema, com data, módulo e dispositivo.",
      },
      { property: "og:title", content: "Logs de atividades dos usuários" },
      {
        property: "og:description",
        content: "Histórico completo das ações dos usuários no sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LogsAtividadesPage,
});

function dataISO(diasAtras: number) {
  const d = new Date();
  d.setHours(d.getHours() - 3);
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
}

function formatarData(valor: string) {
  return new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function LogsAtividadesPage() {
  const [de, setDe] = useState(dataISO(7));
  const [ate, setAte] = useState(dataISO(0));
  const [busca, setBusca] = useState("");
  const [modulo, setModulo] = useState("todos");
  const [usuario, setUsuario] = useState("todos");

  const buscar = useServerFn(listarAtividades);

  const consulta = useQuery({
    queryKey: ["logs-atividades", de, ate, busca, modulo, usuario],
    queryFn: async () => {
      try {
        return await buscar({ data: { de, ate, busca, modulo, usuario, limite: 500 } });
      } catch {
        return {
          ok: false,
          erro: "Não foi possível carregar as atividades agora.",
          atividades: [],
          todos: false,
        };
      }
    },
    staleTime: 30_000,
  });

  const atividades = consulta.data?.atividades ?? [];

  const modulos = useMemo(() => {
    const set = new Set<string>();
    for (const a of atividades) set.add(a.modulo);
    return Array.from(set).sort();
  }, [atividades]);

  const usuarios = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const a of atividades) {
      mapa.set(a.user_id, a.user_nome ?? a.user_email ?? "Usuário");
    }
    return Array.from(mapa, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome),
    );
  }, [atividades]);

  function exportar() {
    downloadCsv(
      "logs-atividades.csv",
      ["Data e hora", "Usuário", "E-mail", "Atividade", "Módulo", "Página", "IP"],
      atividades.map((a) => [
        formatarData(a.created_at),
        a.user_nome ?? "—",
        a.user_email ?? "—",
        a.acao,
        a.modulo,
        a.rota ?? "—",
        a.ip_address ?? "—",
      ]),
    );
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar à Administração
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            <History className="size-8 text-primary" />
            Logs de atividades
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Histórico das ações realizadas pelos usuários dentro do sistema: páginas acessadas,
            envios e registros, com data, hora e dispositivo.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Atividades registradas</CardTitle>
            <CardDescription>
              {consulta.data?.todos
                ? "Você está vendo as atividades de todos os usuários."
                : "Você está vendo apenas as suas atividades."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor="de">De</Label>
                <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ate">Até</Label>
                <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="busca">Atividade</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="busca"
                    className="pl-8"
                    placeholder="Pesquisar..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Módulo</Label>
                <Select value={modulo} onValueChange={setModulo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {modulos.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Usuário</Label>
                <Select value={usuario} onValueChange={setUsuario}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
                <RefreshCw className="mr-2 size-4" /> Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportar}
                disabled={atividades.length === 0}
              >
                <Download className="mr-2 size-4" /> Exportar CSV
              </Button>
              <Badge variant="secondary" className="self-center">
                {atividades.length} registro(s)
              </Badge>
            </div>

            {consulta.data && !consulta.data.ok && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {consulta.data.erro ?? "Não foi possível carregar as atividades."}
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data e hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Página</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consulta.isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        Carregando atividades...
                      </TableCell>
                    </TableRow>
                  )}
                  {!consulta.isLoading && atividades.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        Nenhuma atividade registrada no período.
                      </TableCell>
                    </TableRow>
                  )}
                  {atividades.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatarData(a.created_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{a.user_nome ?? "—"}</span>
                        <span className="block text-muted-foreground">{a.user_email ?? ""}</span>
                      </TableCell>
                      <TableCell className="text-xs">{a.acao}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline">{a.modulo}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.rota ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.ip_address ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <FloatingNav />
    </main>
  );
}
